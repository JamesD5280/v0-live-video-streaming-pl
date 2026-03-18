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
 * Environment variables required (put in .env file):
 *   BUNNY_STORAGE_ZONE=2mstreamsn
 *   BUNNY_STORAGE_API_KEY=your-bunny-storage-api-key
 *   BUNNY_CDN_HOSTNAME=2mstreamsn.b-cdn.net
 *   SUPABASE_URL=https://ouobhgelqzxhxbiwuhlu.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
 *   APP_URL=https://2mstream.com
 */

// Load .env file if it exists (install dotenv: npm install dotenv)
try {
require('dotenv').config();

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Configuration - set these environment variables on your VPS
const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || '2mstreamsn';
const BUNNY_STORAGE_API_KEY = process.env.BUNNY_STORAGE_API_KEY;
const BUNNY_CDN_HOSTNAME = process.env.BUNNY_CDN_HOSTNAME || '2mstreamsn.b-cdn.net';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.APP_URL || 'https://2mstream.com';

// Temp directory for assembling files
const TEMP_DIR = '/tmp/video-assembly';

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Helper: Make HTTPS request
function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const protocol = options.protocol === 'http:' ? http : https;
    const req = protocol.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        console.log(`    [DEBUG] HTTP ${res.statusCode}: ${body.toString().substring(0, 200)}`);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body.toString()}`));
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

// Get videos with status 'uploading' from Supabase
async function getUploadingVideos() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  const { data, error } = await supabase
    .from('videos')
    .select('*')
    .eq('status', 'uploading');
  
  if (error) {
    throw new Error(`Failed to fetch videos: ${error.message}`);
  }
  
  return data || [];
}

// List files in Bunny temp-uploads folder
async function listBunnyTempFiles() {
  const options = {
    hostname: 'storage.bunnycdn.com',
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
    hostname: BUNNY_CDN_HOSTNAME,
    path: `/temp-uploads/${encodeURIComponent(chunkFilename)}`,
    method: 'GET',
    headers: {
      'AccessKey': BUNNY_STORAGE_API_KEY,
    }
  };
  
  const { body } = await makeRequest(options);
  return body;
}

// Upload assembled video to Bunny videos folder
async function uploadToBunny(filename, buffer) {
  const options = {
    hostname: BUNNY_CDN_HOSTNAME,
    path: `/videos/${encodeURIComponent(filename)}`,
    method: 'PUT',
    headers: {
      'AccessKey': BUNNY_STORAGE_API_KEY,
      'Content-Type': 'application/octet-stream',
      'Content-Length': buffer.length,
    }
  };
  
  await makeRequest(options, buffer);
  return `https://${BUNNY_CDN_HOSTNAME}/videos/${encodeURIComponent(filename)}`;
}

// Delete chunk from Bunny
async function deleteChunk(chunkFilename) {
  const options = {
    hostname: BUNNY_CDN_HOSTNAME,
    path: `/temp-uploads/${encodeURIComponent(chunkFilename)}`,
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
    .update({ status, storage_path: storagePath })
    .eq('id', videoId)
    .select()
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

// Main assembly function for a single video
async function assembleVideo(video) {
  const uploadId = extractUploadId(video.storage_path);
  
  if (!uploadId) {
    console.log(`  Skipping video ${video.id}: No valid upload ID in storage_path`);
    return false;
  }
  
  console.log(`  Processing video: ${video.title}`);
  console.log(`    Upload ID: ${uploadId}`);
  console.log(`    Filename: ${video.filename}`);
  
  // We'll try to download chunks starting from 0 and count up until we get a 404
  // This avoids needing to list the bucket
  const chunks = [];
  let chunkIndex = 0;
  let totalSize = 0;
  
  console.log(`    Discovering and downloading chunks...`);
  
  // Try downloading chunks until we get a 404 or error
  while (true) {
    const chunkName = `${uploadId}-chunk-${chunkIndex}`;
    try {
      process.stdout.write(`\r    Downloading chunk ${chunkIndex}...`);
      const data = await downloadChunk(chunkName);
      chunks.push(data);
      totalSize += data.length;
      chunkIndex++;
    } catch (err) {
      // If chunk doesn't exist, we've reached the end
      if (err.message.includes('404') || err.message.includes('404')) {
        console.log(`\n    Found ${chunkIndex} chunks`);
        break;
      }
      // For other errors, still try to continue
      if (chunkIndex === 0) {
        console.log(`\n    ERROR: Could not download first chunk: ${err.message}`);
        return false;
      }
      console.log(`\n    Stopped at chunk ${chunkIndex}: ${err.message}`);
      break;
    }
  }
  
  if (chunks.length === 0) {
    console.log(`    ERROR: No chunks found for upload ID ${uploadId}`);
    return false;
  }
  
  console.log(`    Downloaded ${totalSize} bytes total from ${chunks.length} chunks`);
  
  // Combine all chunks
  console.log(`    Combining chunks...`);
  const completeFile = Buffer.concat(chunks);
  console.log(`    Combined file size: ${completeFile.length} bytes`);
  
  // Upload to videos folder
  console.log(`    Uploading to Bunny videos folder...`);
  const cdnUrl = await uploadToBunny(video.filename, completeFile);
  console.log(`    Uploaded: ${cdnUrl}`);
  
  // Update video status in database
  console.log(`    Updating database status to 'ready'...`);
  try {
    await updateVideoStatus(video.id, 'ready', cdnUrl);
    console.log(`    Database updated successfully`);
  } catch (err) {
    console.error(`    ERROR updating database: ${err.message}`);
    throw err;
  }
  
  // Clean up temp chunks (best effort)
  console.log(`    Cleaning up ${chunks.length} temp chunks...`);
  for (let i = 0; i < chunks.length; i++) {
    try {
      await deleteChunk(`${uploadId}-chunk-${i}`);
    } catch (err) {
      console.log(`    Note: Could not delete chunk ${i}: ${err.message}`);
    }
  }
  
  console.log(`    Done!`);
  return true;
}
  
  console.log(`  Processing video: ${video.title}`);
  console.log(`    Upload ID: ${uploadId}`);
  console.log(`    Filename: ${video.filename}`);
  
  // List all files in temp-uploads
  const allFiles = await listBunnyTempFiles();
  
  // Find chunks for this upload ID
  const chunkPattern = new RegExp(`^${uploadId}-chunk-(\\d+)$`);
  const chunks = allFiles
    .filter(f => chunkPattern.test(f.ObjectName))
    .map(f => ({
      name: f.ObjectName,
      index: parseInt(f.ObjectName.match(chunkPattern)[1]),
      size: f.Length,
    }))
    .sort((a, b) => a.index - b.index);
  
  if (chunks.length === 0) {
    console.log(`    No chunks found for upload ID ${uploadId}`);
    return false;
  }
  
  console.log(`    Found ${chunks.length} chunks`);
  
  // Verify chunks are sequential (0, 1, 2, ...)
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].index !== i) {
      console.log(`    ERROR: Missing chunk ${i} (found ${chunks[i].index})`);
      return false;
    }
  }
  
  // Download and assemble chunks
  console.log(`    Downloading and assembling chunks...`);
  const assembledChunks = [];
  let totalSize = 0;
  
  for (const chunk of chunks) {
    process.stdout.write(`\r    Downloading chunk ${chunk.index + 1}/${chunks.length}...`);
    const data = await downloadChunk(chunk.name);
    assembledChunks.push(data);
    totalSize += data.length;
  }
  
  console.log(`\n    Downloaded ${totalSize} bytes total`);
  
  // Combine all chunks
  console.log(`    Combining chunks...`);
  const completeFile = Buffer.concat(assembledChunks);
  console.log(`    Combined file size: ${completeFile.length} bytes`);
  
  // Upload to videos folder
  console.log(`    Uploading to Bunny videos folder...`);
  const cdnUrl = await uploadToBunny(video.filename, completeFile);
  console.log(`    Uploaded: ${cdnUrl}`);
  
  // Update video status in database directly (no API call needed)
  console.log(`    Updating database status to 'ready'...`);
  try {
    await updateVideoStatus(video.id, 'ready', cdnUrl);
    console.log(`    Database updated successfully`);
  } catch (err) {
    console.error(`    Failed to update database: ${err.message}`);
    throw err;
  }
  
  // Clean up temp chunks
  console.log(`    Cleaning up ${chunks.length} temp chunks...`);
  for (const chunk of chunks) {
    await deleteChunk(chunk.name);
  }
  
  console.log(`    Done!`);
  return true;
}

// Main function
async function main() {
  console.log('=== VPS Chunk Assembler ===');
  console.log(`Time: ${new Date().toISOString()}`);
  
  // Validate environment
  if (!BUNNY_STORAGE_API_KEY) {
    console.error('ERROR: BUNNY_STORAGE_API_KEY not set');
    process.exit(1);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
    process.exit(1);
  }
  
  try {
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
