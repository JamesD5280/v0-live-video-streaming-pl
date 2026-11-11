#!/usr/bin/env node
/**
 * VPS Chunk Assembler Script
 * 
 * This script runs on your VPS to assemble video chunks from Bunny temp-uploads
 * into complete videos. It should be run as a cron job or background service.
 * 
 * Setup:
 *   1. Copy this script to your VPS
 *   2. Create a .env file in the same directory with your credentials
 *   3. Run: npm install dotenv (or just set environment variables directly)
 *   4. Run: node vps-chunk-assembler.js
 * 
 * Environment variables required on the VPS:
 *   BUNNY_STORAGE_ZONE, BUNNY_STORAGE_PASSWORD (or BUNNY_STORAGE_API_KEY), BUNNY_STORAGE_REGION
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL
 *   VPS_WEBHOOK_SECRET (used for the app callback; direct DB update is the fallback)
 */

// Load .env file if it exists (install dotenv: npm install dotenv)
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not installed, will use system environment variables
  console.log('Note: dotenv not installed, using system environment variables');
}

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { createClient } = require('@supabase/supabase-js');

const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || '2mstreamsn';
const BUNNY_STORAGE_API_KEY = (process.env.BUNNY_STORAGE_PASSWORD || process.env.BUNNY_STORAGE_API_KEY || '').trim();
const REGION_MAP = {
  'new york': 'ny', newyork: 'ny', ny: 'ny',
  'los angeles': 'la', losangeles: 'la', la: 'la',
  singapore: 'sg', sg: 'sg', sydney: 'syd', syd: 'syd',
  johannesburg: 'jh', jh: 'jh', frankfurt: 'de', de: 'de',
  london: 'uk', uk: 'uk', stockholm: 'se', se: 'se',
};
const RAW_STORAGE_REGION = (process.env.BUNNY_STORAGE_REGION || 'ny').toLowerCase();
const BUNNY_STORAGE_REGION = REGION_MAP[RAW_STORAGE_REGION] || 'ny';
const BUNNY_STORAGE_HOSTNAME = `${BUNNY_STORAGE_REGION}.storage.bunnycdn.com`;
const BUNNY_CDN_HOSTNAME = (process.env.BUNNY_CDN_HOSTNAME || `${BUNNY_STORAGE_ZONE}.b-cdn.net`)
  .replace(/^https?:\/\//, '')
  .replace(/\/.*$/, '');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VPS_WEBHOOK_SECRET = process.env.VPS_WEBHOOK_SECRET;
const APP_URL = process.env.APP_URL || 'https://2mstream.com';

// Temp directory for assembling files
const TEMP_DIR = '/tmp/video-assembly';

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Helper: Make HTTPS request
function makeRequest(options, postData = null, retries = 3) {
  return new Promise((resolve, reject) => {
    const protocol = options.protocol === 'http:' ? http : https;
    
    const req = protocol.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body });
        } else {
          const error = new Error(`HTTP ${res.statusCode}: ${body.toString()}`);
          error.statusCode = res.statusCode;
          reject(error);
        }
      });
    });
    
    // Set socket timeout to 5 minutes for large uploads
    req.setTimeout(300000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.on('error', (err) => {
      if (retries > 0 && (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.message.includes('timeout'))) {
        console.log(`    Retrying (${retries} retries left)...`);
        setTimeout(() => {
          makeRequest(options, postData, retries - 1)
            .then(resolve)
            .catch(reject);
        }, 2000);
      } else {
        reject(err);
      }
    });
    
    if (postData) req.write(postData);
    req.end();
  });
}

// Get videos with status 'uploading' from Supabase
async function getUploadingVideos() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  const { data, error } = await supabase
    .from('videos')
    .select('id,title,filename,file_size,storage_path,status')
    .eq('status', 'uploading')
    .order('created_at', { ascending: true });
  
  if (error) {
    throw new Error(`Failed to fetch videos: ${error.message}`);
  }
  
  return data || [];
}

async function reclaimStaleProcessingVideos() {
  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('videos')
    .update({ status: 'uploading', updated_at: new Date().toISOString() })
    .eq('status', 'processing')
    .lt('updated_at', cutoff)
    .select('id');

  if (error) throw new Error(`Failed to reclaim stale processing videos: ${error.message}`);
  if (data && data.length > 0) {
    console.log(`Re-queued ${data.length} stale processing video(s).`);
  }
}

async function claimVideo(videoId) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('videos')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', videoId)
    .eq('status', 'uploading')
    .select('id')
    .maybeSingle();

  if (error) throw new Error(`Failed to claim video ${videoId}: ${error.message}`);
  return Boolean(data);
}

// List files in Bunny temp-uploads folder
async function listBunnyTempFiles() {
  const options = {
    hostname: BUNNY_STORAGE_HOSTNAME,
    path: `/${BUNNY_STORAGE_ZONE}/temp-uploads/`,
    method: 'GET',
    headers: {
      'AccessKey': BUNNY_STORAGE_API_KEY,
      'Accept': 'application/json',
    }
  };
  
  const { body } = await makeRequest(options);
  return JSON.parse(body.toString());
}

// Download a chunk from Bunny
async function downloadChunk(chunkFilename) {
  const options = {
    hostname: BUNNY_STORAGE_HOSTNAME,
    path: `/${BUNNY_STORAGE_ZONE}/temp-uploads/${encodeURIComponent(chunkFilename)}`,
    method: 'GET',
    headers: {
      'AccessKey': BUNNY_STORAGE_API_KEY,
    }
  };
  
  const { body } = await makeRequest(options);
  return body;
}

// Upload the assembled file as a stream so large videos do not need to fit in memory.
async function uploadToBunny(filename, localFilePath) {
  const fileSize = fs.statSync(localFilePath).size;
  const requestPath = `/${BUNNY_STORAGE_ZONE}/videos/${encodeURIComponent(filename)}`;
  const options = {
    hostname: BUNNY_STORAGE_HOSTNAME,
    path: requestPath,
    method: 'PUT',
    headers: {
      'AccessKey': BUNNY_STORAGE_API_KEY,
      'Content-Type': 'application/octet-stream',
      'Content-Length': fileSize,
    }
  };

  console.log(`    Uploading ${fileSize} bytes to Bunny Storage...`);
  await new Promise((resolve, reject) => {
    const request = https.request(options, (response) => {
      const responseChunks = [];
      response.on('data', (chunk) => responseChunks.push(chunk));
      response.on('end', () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Bunny upload failed with HTTP ${response.statusCode}: ${Buffer.concat(responseChunks).toString()}`));
        }
      });
    });
    request.setTimeout(300000, () => request.destroy(new Error('Bunny upload timeout')));
    request.on('error', reject);
    fs.createReadStream(localFilePath).on('error', reject).pipe(request);
  });

  return `https://${BUNNY_CDN_HOSTNAME}/videos/${encodeURIComponent(filename)}`;
}

// Delete chunk from Bunny
async function deleteChunk(chunkFilename) {
  const options = {
    hostname: BUNNY_STORAGE_HOSTNAME,
    path: `/${BUNNY_STORAGE_ZONE}/temp-uploads/${encodeURIComponent(chunkFilename)}`,
    method: 'DELETE',
    headers: {
      'AccessKey': BUNNY_STORAGE_API_KEY,
    }
  };
  
  try {
    await makeRequest(options);
  } catch (err) {
    console.warn(`Warning: Could not delete chunk ${chunkFilename}:`, err.message);
  }
}

// Call the finalize-assembly API with fallback to direct database update
async function finalizeAssembly(videoId, cdnUrl) {
  const appUrl = new URL(`${APP_URL}/api/videos/finalize-assembly`);
  const postData = JSON.stringify({ video_id: videoId, cdn_url: cdnUrl });
  
  const options = {
    hostname: appUrl.hostname,
    path: appUrl.pathname,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${VPS_WEBHOOK_SECRET || ''}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    }
  };
  
  try {
    console.log(`  Calling API endpoint: ${APP_URL}/api/videos/finalize-assembly`);
    const { body } = await makeRequest(options, postData);
    const result = JSON.parse(body.toString());
    console.log(`  API call succeeded`);
    return result;
  } catch (err) {
    // If API call fails, fall back to direct database update
    console.log(`  API call failed (${err.message}), updating database directly...`);
    return await updateVideoStatus(videoId, 'ready', cdnUrl);
  }
}

// Update video status directly in Supabase
async function updateVideoStatus(videoId, status, storagePath) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  console.log(`    Updating video ${videoId} to status '${status}'...`);
  
  const { data, error } = await supabase
    .from('videos')
    .update({ status, storage_path: storagePath, updated_at: new Date().toISOString() })
    .eq('id', videoId)
    .select('id,status,storage_path')
    .single();
  
  if (error) {
    throw new Error(`Failed to update video: ${error.message}`);
  }
  
  return data;
}

// Extract upload ID from storage_path
function extractUploadId(storagePath) {
  // storage_path format: bunny://temp-uploads/UPLOAD_ID
  const match = storagePath?.match(/bunny:\/\/temp-uploads\/([a-f0-9-]+)/);
  return match ? match[1] : null;
}

// Assemble one video without holding the complete file in memory.
async function assembleVideo(video) {
  const uploadId = extractUploadId(video.storage_path);
  if (!uploadId) {
    console.log(`  Skipping video ${video.id}: No valid upload ID in storage_path`);
    return false;
  }

  const localFilePath = path.join(TEMP_DIR, `${video.id}.assembled`);
  let claimed = false;
  let chunkCount = 0;

  try {
    claimed = await claimVideo(video.id);
    if (!claimed) {
      console.log(`  Skipping video ${video.id}: another worker already claimed it`);
      return false;
    }

    console.log(`  Processing video: ${video.title}`);
    console.log(`    Upload ID: ${uploadId}`);
    console.log(`    Filename: ${video.filename}`);

    const chunkStream = (async function* () {
      for (let chunkIndex = 0; ; chunkIndex++) {
        const chunkName = `${uploadId}-chunk-${chunkIndex}`;
        try {
          const data = await downloadChunk(chunkName);
          chunkCount++;
          process.stdout.write(`\r    Downloaded chunk ${chunkIndex} (${data.length} bytes)`);
          yield data;
        } catch (error) {
          if (error.statusCode === 404) {
            if (chunkCount === 0) {
              throw new Error(`No chunks found for upload ID ${uploadId}`);
            }
            console.log(`\n    Found ${chunkCount} chunks`);
            return;
          }
          throw error;
        }
      }
    })();

    fs.rmSync(localFilePath, { force: true });
    await pipeline(Readable.from(chunkStream), fs.createWriteStream(localFilePath));

    const assembledSize = fs.statSync(localFilePath).size;
    const expectedSize = Number(video.file_size);
    if (expectedSize > 0 && assembledSize !== expectedSize) {
      throw new Error(`Chunk size mismatch: expected ${expectedSize} bytes, assembled ${assembledSize}`);
    }

    console.log(`    Assembled ${assembledSize} bytes from ${chunkCount} chunks`);
    const cdnUrl = await uploadToBunny(video.filename, localFilePath);
    console.log(`    Uploaded: ${cdnUrl}`);

    await finalizeAssembly(video.id, cdnUrl);
    console.log(`    Video ${video.id} is ready`);

    for (let index = 0; index < chunkCount; index++) {
      await deleteChunk(`${uploadId}-chunk-${index}`);
    }

    return true;
  } catch (error) {
    console.error(`  ERROR processing video ${video.id}:`, error.message);
    if (claimed) {
      const isPermanentDataError =
        error.message.startsWith('No chunks found') ||
        error.message.startsWith('Chunk size mismatch');
      try {
        await updateVideoStatus(video.id, isPermanentDataError ? 'error' : 'uploading', video.storage_path);
      } catch (statusError) {
        console.error(`  Could not release video ${video.id}:`, statusError.message);
      }
    }
    return false;
  } finally {
    fs.rmSync(localFilePath, { force: true });
  }
}

// Main function
async function main() {
  console.log('=== VPS Chunk Assembler ===');
  console.log(`Time: ${new Date().toISOString()}`);
  
  // Validate environment
  if (!BUNNY_STORAGE_API_KEY) {
    console.error('ERROR: BUNNY_STORAGE_PASSWORD or BUNNY_STORAGE_API_KEY not set');
    process.exit(1);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
    process.exit(1);
  }
  
  try {
    await reclaimStaleProcessingVideos();

    // Get videos with status 'uploading'
    console.log('\nFetching videos with status "uploading"...');
    const videos = await getUploadingVideos();
    
    if (videos.length === 0) {
      console.log('No videos need assembly.');
      return;
    }
    
    console.log(`Found ${videos.length} video(s) to process.\n`);
    
    // Process each video
    let successCount = 0;
    for (const video of videos) {
      try {
        const success = await assembleVideo(video);
        if (success) successCount++;
      } catch (err) {
        console.error(`  ERROR processing video ${video.id}:`, err.message);
      }
    }
    
    console.log(`\n=== Complete: ${successCount}/${videos.length} videos assembled ===`);
    
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

// Run the script
main();
