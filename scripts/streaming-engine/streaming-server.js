/**
 * 2MStream - Streaming Engine Server
 * 
 * Run this on your dedicated server:
 *   1. Install Node.js and FFmpeg on your server
 *   2. Copy this file to your server
 *   3. Run: npm init -y && npm install express cors
 *   4. Run: node streaming-server.js
 * 
 * It will listen on port 3001 (or PORT env var) and accept
 * commands from the 2MStream dashboard to start/stop FFmpeg
 * processes that push video files to RTMP destinations.
 * 
 * Environment variables:
 *   PORT - Server port (default: 3001)
 *   API_SECRET - Shared secret for authenticating requests from 2MStream
 *   VIDEO_DIR - Directory where uploaded videos are stored (default: ./videos)
 */

import express from 'express'
import cors from 'cors'
import { spawn } from 'child_process'
import { existsSync, writeFileSync, unlinkSync, mkdirSync, readdirSync, statSync, createWriteStream } from 'fs'
import { join, basename } from 'path'
import { tmpdir } from 'os'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { createHmac } from 'crypto'

const app = express()
app.use(cors())
// JSON body parser for command endpoints (not upload -- that streams raw)
app.use((req, res, next) => {
  if (req.path === '/upload' || req.path === '/upload/chunk') return next() // skip JSON parsing for uploads
  express.json({ limit: '1mb' })(req, res, next)
})

const PORT = process.env.PORT || 3001
const API_SECRET = process.env.API_SECRET || 'change-this-secret'
const VIDEO_DIR = process.env.VIDEO_DIR || './videos'

// Active FFmpeg processes: streamId -> { processes, destinations[], tempFiles[] }
const activeStreams = new Map()

// Auth middleware
function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (token !== API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

app.use(authenticate)

// Health check
app.get('/health', (req, res) => {
  const streams = []
  for (const [streamId, info] of activeStreams) {
    streams.push({
      streamId,
      destinations: info.destinations.length,
      running: info.processes.some(p => !p.proc.killed),
      isPlaylist: info.isPlaylist || false,
      hasOverlays: (info.overlayCount || 0) > 0,
    })
  }
  res.json({ 
    status: 'ok', 
    activeStreams: activeStreams.size,
    streams,
    uptime: process.uptime(),
  })
})

/**
 * Build FFmpeg overlay filter chain for image and text overlays.
 * Returns { inputArgs, filterComplex } or null if no overlays.
 */
function buildOverlayFilters(overlays) {
  if (!overlays || overlays.length === 0) return null

  const inputArgs = []
  const filters = []
  let currentLabel = '0:v'
  let inputIndex = 1 // 0 is the main video input

  for (let i = 0; i < overlays.length; i++) {
    const overlay = overlays[i]
    const outputLabel = `ov${i}`

    // Map position string to FFmpeg overlay coordinates
    const posMap = {
      'top-left': 'x=10:y=10',
      'top-center': 'x=(W-w)/2:y=10',
      'top-right': 'x=W-w-10:y=10',
      'center': 'x=(W-w)/2:y=(H-h)/2',
      'bottom-left': 'x=10:y=H-h-10',
      'bottom-center': 'x=(W-w)/2:y=H-h-10',
      'bottom-right': 'x=W-w-10:y=H-h-10',
    }
    const posCoords = posMap[overlay.position] || posMap['top-left']

    if (overlay.type === 'text' || overlay.type === 'lower_third') {
      // Text overlay using drawtext filter
      const escapedText = (overlay.textContent || '').replace(/'/g, "'\\''").replace(/:/g, '\\:')
      const fontSize = overlay.fontSize || 24
      const fontColor = overlay.fontColor || 'white'
      
      if (overlay.type === 'lower_third') {
        // Lower third: box with background + text at bottom
        const bgColor = overlay.bgColor || '0x00000080'
        filters.push(
          `[${currentLabel}]drawbox=x=0:y=ih-${fontSize + 30}:w=iw:h=${fontSize + 30}:color=${bgColor}@0.7:t=fill[bg${i}]`,
          `[bg${i}]drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${fontColor}:x=20:y=h-${fontSize + 15}[${outputLabel}]`
        )
      } else {
        filters.push(
          `[${currentLabel}]drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${fontColor}:${posCoords.replace('x=', 'x=').replace('y=', 'y=')}[${outputLabel}]`
        )
      }
      currentLabel = outputLabel
    } else if (overlay.type === 'video' && overlay.videoPath) {
      // Video overlay (rotating logo, animation .MOV/.MP4)
      // Use -stream_loop -1 for looping, applied per-input via input options
      if (overlay.loopOverlay !== false) {
        inputArgs.push('-stream_loop', '-1')
      }
      inputArgs.push('-i', overlay.videoPath)
      
      const scalePercent = overlay.sizePercent || 15
      const opacityValue = (overlay.opacity || 100) / 100

      // Scale the video overlay, apply alpha channel (for .MOV with transparency), and set opacity
      const scaleFilter = `[${inputIndex}:v]scale=iw*${scalePercent}/100:-1,format=rgba,colorchannelmixer=aa=${opacityValue}[vid${i}]`
      filters.push(scaleFilter)
      filters.push(`[${currentLabel}][vid${i}]overlay=${posCoords}:shortest=0[${outputLabel}]`)
      
      currentLabel = outputLabel
      inputIndex++
    } else if (overlay.imagePath) {
      // Image overlay (logo, bug, image)
      inputArgs.push('-i', overlay.imagePath)
      
      const scalePercent = overlay.sizePercent || 15
      const opacityValue = (overlay.opacity || 100) / 100

      // Scale the overlay image relative to main video size, and apply opacity
      const scaleFilter = `[${inputIndex}:v]scale=iw*${scalePercent}/100:-1,format=rgba,colorchannelmixer=aa=${opacityValue}[img${i}]`
      filters.push(scaleFilter)
      filters.push(`[${currentLabel}][img${i}]overlay=${posCoords}[${outputLabel}]`)
      
      currentLabel = outputLabel
      inputIndex++
    }
  }

  if (filters.length === 0) return null

  // The final label needs to map to output
  return {
    inputArgs,
    filterComplex: filters.join(';'),
    outputLabel: currentLabel,
  }
}

/**
 * Create a concat file for FFmpeg playlist mode.
 * Returns the path to the temp concat file.
 */
function createConcatFile(videoSources, loop) {
  const lines = ["# FFmpeg concat demuxer file"]
  for (const src of videoSources) {
    const path = src.url || join(VIDEO_DIR, src.path || '')
    lines.push(`file '${path}'`)
  }
  
  const concatPath = join(tmpdir(), `2mstream-concat-${Date.now()}.txt`)
  writeFileSync(concatPath, lines.join('\n'))
  return concatPath
}

// Ensure video directory exists
mkdirSync(VIDEO_DIR, { recursive: true })

/**
 * POST /upload
 * Receives a raw video file as the request body via streaming.
 * Headers:
 *   x-filename: "original-filename.mp4"
 *   content-type: application/octet-stream
 */
app.post('/upload', async (req, res) => {
  const filename = req.headers['x-filename'] || `upload-${Date.now()}.mp4`
  const safeFilename = basename(String(filename)) // prevent directory traversal
  const destPath = join(VIDEO_DIR, safeFilename)

  console.log(`[2MStream] Receiving upload: ${safeFilename}`)

  try {
    const writeStream = createWriteStream(destPath)
    let received = 0

    req.on('data', (chunk) => {
      received += chunk.length
    })

    await pipeline(req, writeStream)

    const sizeMB = (received / (1024 * 1024)).toFixed(1)
    console.log(`[2MStream] Upload complete: ${safeFilename} (${sizeMB} MB)`)

    res.json({ 
      success: true, 
      filename: safeFilename, 
      path: destPath,
      size: received,
    })
  } catch (err) {
    console.error(`[2MStream] Upload failed for ${safeFilename}:`, err.message)
    // Clean up partial file
    try { unlinkSync(destPath) } catch {}
    res.status(500).json({ error: `Upload failed: ${err.message}` })
  }
})

// Track ongoing chunked uploads: uploadId -> { filename, receivedChunks, totalChunks, tempDir }
const chunkedUploads = new Map()

/**
 * POST /upload/chunk
 * Receives a chunk of a file upload for reassembly.
 * Headers:
 *   x-filename: "original-filename.mp4"
 *   x-upload-id: unique upload identifier
 *   x-chunk-index: 0-based index of this chunk
 *   x-total-chunks: total number of chunks
 *   content-type: application/octet-stream
 */
app.post('/upload/chunk', async (req, res) => {
  const filename = req.headers['x-filename'] || `upload-${Date.now()}.mp4`
  const uploadId = req.headers['x-upload-id'] || `default-${Date.now()}`
  const chunkIndex = parseInt(req.headers['x-chunk-index'] || '0', 10)
  const totalChunks = parseInt(req.headers['x-total-chunks'] || '1', 10)
  const safeFilename = basename(String(filename))

  try {
    // Create temp directory for chunks if needed
    if (!chunkedUploads.has(uploadId)) {
      const tempDir = join(tmpdir(), `2mstream-upload-${uploadId}`)
      mkdirSync(tempDir, { recursive: true })
      chunkedUploads.set(uploadId, {
        filename: safeFilename,
        receivedChunks: new Set(),
        totalChunks,
        tempDir,
      })
    }

    const upload = chunkedUploads.get(uploadId)
    const chunkPath = join(upload.tempDir, `chunk-${String(chunkIndex).padStart(6, '0')}`)

    // Write chunk to temp file
    const writeStream = createWriteStream(chunkPath)
    await pipeline(req, writeStream)
    upload.receivedChunks.add(chunkIndex)

    console.log(`[2MStream] Chunk ${chunkIndex + 1}/${totalChunks} received for ${safeFilename}`)

    // If all chunks received, assemble the file
    if (upload.receivedChunks.size === totalChunks) {
      const destPath = join(VIDEO_DIR, safeFilename)
      const finalStream = createWriteStream(destPath)
      
      for (let i = 0; i < totalChunks; i++) {
        const cp = join(upload.tempDir, `chunk-${String(i).padStart(6, '0')}`)
        const { readFileSync } = await import('fs')
        const data = readFileSync(cp)
        finalStream.write(data)
        try { unlinkSync(cp) } catch {}
      }
      finalStream.end()

      // Wait for write to finish
      await new Promise((resolve, reject) => {
        finalStream.on('finish', resolve)
        finalStream.on('error', reject)
      })

      // Clean up temp dir
      try { 
        const { rmdirSync } = await import('fs')
        rmdirSync(upload.tempDir) 
      } catch {}
      chunkedUploads.delete(uploadId)

      const stats = statSync(destPath)
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(1)
      console.log(`[2MStream] Upload assembled: ${safeFilename} (${sizeMB} MB)`)

      return res.json({
        success: true,
        complete: true,
        filename: safeFilename,
        path: destPath,
        size: stats.size,
      })
    }

    res.json({
      success: true,
      complete: false,
      received: upload.receivedChunks.size,
      total: totalChunks,
    })
  } catch (err) {
    console.error(`[2MStream] Chunk upload failed:`, err.message)
    res.status(500).json({ error: `Chunk upload failed: ${err.message}` })
  }
})

/**
 * GET /videos
 * Lists all video files in the VIDEO_DIR
 */
app.get('/videos', (req, res) => {
  try {
    const files = readdirSync(VIDEO_DIR)
      .filter(f => /\.(mp4|mkv|mov|avi|flv|ts|webm)$/i.test(f))
      .map(f => {
        const stats = statSync(join(VIDEO_DIR, f))
        return {
          filename: f,
          size: stats.size,
          modified: stats.mtime,
        }
      })
      .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())

    res.json({ videos: files, directory: VIDEO_DIR })
  } catch (err) {
    res.json({ videos: [], directory: VIDEO_DIR, error: err.message })
  }
})

/**
 * GET /stream-video/:filename
 * Streams a video file for preview playback.
 * Supports HTTP Range requests for seeking.
 * Accepts either Bearer token auth or signed URL token (?token=...&expires=...)
 */
app.get('/stream-video/:filename', (req, res) => {
  // Allow signed token auth for direct browser access
  const { token, expires } = req.query
  const bearerAuth = req.headers.authorization
  
  if (token && expires) {
    // Verify signed URL token
    const filename = basename(req.params.filename)
    const payload = `${filename}:${expires}`
    const expected = createHmac('sha256', API_SECRET).update(payload).digest('hex')
    if (token !== expected || Date.now() > parseInt(expires, 10)) {
      return res.status(403).json({ error: 'Invalid or expired token' })
    }
  } else if (!bearerAuth || bearerAuth !== `Bearer ${API_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const safeFilename = basename(req.params.filename)
  const filePath = join(VIDEO_DIR, safeFilename)

  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' })
  }

  const stat = statSync(filePath)
  const fileSize = stat.size

  // Determine content type
  const ext = safeFilename.split('.').pop()?.toLowerCase() || 'mp4'
  const mimeTypes = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    webm: 'video/webm',
    flv: 'video/x-flv',
    ts: 'video/mp2t',
  }
  const contentType = mimeTypes[ext] || 'video/mp4'

  const range = req.headers.range
  if (range) {
    // Partial content for seeking
    const parts = range.replace(/bytes=/, '').split('-')
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
    const chunkSize = end - start + 1

    const { createReadStream } = require('fs')
    const stream = createReadStream(filePath, { start, end })

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
    })
    stream.pipe(res)
  } else {
    // Full file
    const { createReadStream } = require('fs')
    const stream = createReadStream(filePath)

    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
    })
    stream.pipe(res)
  }
})

/**
 * POST /delete-video
 * Body: { filename: "video-name.mp4" }
 * Deletes a video file from the VIDEO_DIR
 */
app.post('/delete-video', (req, res) => {
  const { filename } = req.body
  if (!filename) return res.status(400).json({ error: 'Missing filename' })

  const safeFilename = basename(String(filename))
  const filePath = join(VIDEO_DIR, safeFilename)

  if (!existsSync(filePath)) {
    return res.json({ success: true, message: 'File not found (already deleted)' })
  }

  try {
    unlinkSync(filePath)
    console.log(`[2MStream] Deleted video: ${safeFilename}`)
    res.json({ success: true, filename: safeFilename })
  } catch (err) {
    console.error(`[2MStream] Failed to delete ${safeFilename}:`, err.message)
    res.status(500).json({ error: `Failed to delete: ${err.message}` })
  }
})

/**
 * POST /start
 * Body: {
 *   streamId: "uuid",
 *   videoSources: [{ url?, path?, title? }],
 *   videoUrl: "https://...",       // backward compat
 *   videoPath: "local-file.mp4",   // backward compat
 *   destinations: [{ id, name, rtmpUrl, streamKey }],
 *   overlays: [{ id, type, imagePath?, videoPath?, loopOverlay?, textContent?, fontSize, fontColor, bgColor, position, sizePercent, opacity }],
 *   loop: true/false,
 *   isPlaylist: true/false,
 *   isRtmpPull: true/false,
 *   rtmpPullUrl: "rtmp://..."
 * }
 */
app.post('/start', (req, res) => {
  const { 
    streamId, 
    videoSources, 
    videoUrl, 
    videoPath, 
    destinations, 
    overlays, 
    loop = true, 
    isPlaylist = false,
    isRtmpPull = false,
    rtmpPullUrl = null,
  } = req.body

  if (!streamId || !destinations || destinations.length === 0) {
    return res.status(400).json({ error: 'Missing streamId or destinations' })
  }

  // Stop existing stream if running
  if (activeStreams.has(streamId)) {
    stopStream(streamId)
  }

  const tempFiles = []

  // Determine input arguments
  let inputArgs = []

  if (isRtmpPull && rtmpPullUrl) {
    // RTMP pull mode: pull from external RTMP stream
    console.log(`[2MStream] RTMP Pull mode from: ${rtmpPullUrl}`)
    inputArgs = [
      '-rw_timeout', '10000000', // 10s timeout for RTMP connection
      '-i', rtmpPullUrl,
    ]
  } else if (isPlaylist && videoSources && videoSources.length > 1) {
    // Playlist mode: use concat demuxer
    const concatFile = createConcatFile(videoSources, loop)
    tempFiles.push(concatFile)
    
    inputArgs = [
      '-re',
      '-f', 'concat',
      '-safe', '0',
      ...(loop ? ['-stream_loop', '-1'] : []),
      '-i', concatFile,
    ]
  } else {
    // Single video mode
    const source = videoSources?.[0]
    const inputSource = source?.url || videoUrl || join(VIDEO_DIR, source?.path || videoPath || '')

    if (!source?.url && !videoUrl) {
      const localPath = join(VIDEO_DIR, source?.path || videoPath || '')
      if (!existsSync(localPath)) {
        return res.status(400).json({ error: `Video file not found: ${localPath}` })
      }
    }

    inputArgs = [
      '-re',
      ...(loop ? ['-stream_loop', '-1'] : []),
      '-i', inputSource,
    ]
  }

  // Build overlay filters
  const overlayResult = buildOverlayFilters(overlays)

  const processes = []
  const errors = []

  // Start one FFmpeg process per destination
  for (const dest of destinations) {
    const rtmpTarget = `${dest.rtmpUrl}/${dest.streamKey}`
    
    let ffmpegArgs = [...inputArgs]

    if (overlayResult) {
      // Add overlay input files
      ffmpegArgs.push(...overlayResult.inputArgs)
      // Add filter_complex
      ffmpegArgs.push('-filter_complex', overlayResult.filterComplex)
      // Map the final output label
      ffmpegArgs.push('-map', `[${overlayResult.outputLabel}]`)
      ffmpegArgs.push('-map', '0:a?') // Map audio from first input if it exists
    }

    ffmpegArgs.push(
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-maxrate', '4500k',
      '-bufsize', '9000k',
      '-pix_fmt', 'yuv420p',
      '-g', '60',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-f', 'flv',
      rtmpTarget,
    )

    console.log(`[2MStream] Starting FFmpeg for stream ${streamId} -> ${dest.name || rtmpTarget}`)
    if (overlays?.length > 0) {
      console.log(`[2MStream]   with ${overlays.length} overlay(s)`)
    }
    if (isPlaylist && videoSources?.length > 1) {
      console.log(`[2MStream]   playlist mode: ${videoSources.length} videos, loop=${loop}`)
    }
    if (isRtmpPull) {
      console.log(`[2MStream]   RTMP pull mode from: ${rtmpPullUrl}`)
    }
    
    const proc = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] })

    proc.stderr.on('data', (data) => {
      const msg = data.toString()
      if (msg.includes('Error') || msg.includes('error') || msg.includes('Opening')) {
        console.log(`[FFmpeg ${streamId}/${dest.id}] ${msg.trim()}`)
      }
    })

    proc.on('close', (code) => {
      console.log(`[2MStream] FFmpeg process for ${streamId}/${dest.id} exited with code ${code}`)
    })

    proc.on('error', (err) => {
      console.error(`[2MStream] FFmpeg spawn error for ${streamId}/${dest.id}:`, err.message)
      errors.push({ destinationId: dest.id, error: err.message })
    })

    processes.push({ proc, destId: dest.id, killed: false })
  }

  activeStreams.set(streamId, { 
    processes, 
    destinations, 
    tempFiles,
    isPlaylist,
    isRtmpPull,
    overlayCount: overlays?.length || 0,
    // Store full config for restart/overlay updates
    config: {
      streamId,
      videoSources,
      videoUrl,
      videoPath,
      destinations,
      overlays,
      loop,
      isPlaylist,
      isRtmpPull,
      rtmpPullUrl,
    },
  })

  // Give FFmpeg a moment to start, then check status
  setTimeout(() => {
    const stream = activeStreams.get(streamId)
    if (!stream) return
    const running = stream.processes.filter(p => !p.proc.killed)
    console.log(`[2MStream] Stream ${streamId}: ${running.length}/${stream.processes.length} destinations connected`)
  }, 2000)

  res.json({ 
    success: true, 
    streamId,
    destinationCount: destinations.length,
    overlayCount: overlays?.length || 0,
    isPlaylist,
    isRtmpPull,
    videoCount: videoSources?.length || 1,
    errors: errors.length > 0 ? errors : undefined,
  })
})

/**
 * POST /stop
 * Body: { streamId: "uuid" }
 */
app.post('/stop', (req, res) => {
  const { streamId } = req.body

  if (!streamId) {
    return res.status(400).json({ error: 'Missing streamId' })
  }

  const stopped = stopStream(streamId)
  res.json({ success: true, streamId, wasStopped: stopped })
})

/**
 * GET /status/:streamId
 */
app.get('/status/:streamId', (req, res) => {
  const { streamId } = req.params
  const stream = activeStreams.get(streamId)
  
  if (!stream) {
    return res.json({ streamId, running: false, destinations: [] })
  }

  const destStatuses = stream.processes.map(p => ({
    destinationId: p.destId,
    running: !p.proc.killed,
    pid: p.proc.pid,
  }))

  res.json({
    streamId,
    running: destStatuses.some(d => d.running),
    isPlaylist: stream.isPlaylist || false,
    overlayCount: stream.overlayCount || 0,
    destinations: destStatuses,
  })
})

/**
 * POST /restart
 * Body: { streamId: "uuid", overlays: [...] }
 * Restarts a running stream with updated overlays.
 * Reuses the same video source and destinations.
 */
app.post('/restart', async (req, res) => {
  const { streamId, overlays } = req.body

  if (!streamId) {
    return res.status(400).json({ error: 'Missing streamId' })
  }

  const existing = activeStreams.get(streamId)
  if (!existing || !existing.config) {
    return res.status(404).json({ error: 'Stream not found or not running' })
  }

  console.log(`[2MStream] Restarting stream ${streamId} with ${overlays?.length || 0} overlay(s)`)

  // Build updated config with new overlays
  const updatedConfig = { ...existing.config, overlays: overlays || [] }

  // Stop existing FFmpeg processes
  stopStream(streamId)

  // Brief delay to let FFmpeg fully stop
  await new Promise(r => setTimeout(r, 500))

  // Re-build using the same logic as /start -- simulate a POST to /start
  // We do this by building the request internally
  const tempFiles = []
  let inputArgs = []

  if (updatedConfig.isRtmpPull && updatedConfig.rtmpPullUrl) {
    inputArgs = ['-rw_timeout', '10000000', '-i', updatedConfig.rtmpPullUrl]
  } else if (updatedConfig.isPlaylist && updatedConfig.videoSources?.length > 1) {
    const concatFile = createConcatFile(updatedConfig.videoSources, updatedConfig.loop)
    tempFiles.push(concatFile)
    inputArgs = ['-re', '-f', 'concat', '-safe', '0', ...(updatedConfig.loop ? ['-stream_loop', '-1'] : []), '-i', concatFile]
  } else {
    const source = updatedConfig.videoSources?.[0]
    const inputSource = source?.url || updatedConfig.videoUrl || join(VIDEO_DIR, source?.path || updatedConfig.videoPath || '')
    inputArgs = ['-re', ...(updatedConfig.loop ? ['-stream_loop', '-1'] : []), '-i', inputSource]
  }

  const overlayResult = buildOverlayFilters(updatedConfig.overlays)
  const processes = []

  for (const dest of updatedConfig.destinations) {
    const rtmpTarget = `${dest.rtmpUrl}/${dest.streamKey}`
    let ffmpegArgs = [...inputArgs]

    if (overlayResult) {
      ffmpegArgs.push(...overlayResult.inputArgs)
      ffmpegArgs.push('-filter_complex', overlayResult.filterComplex)
      ffmpegArgs.push('-map', `[${overlayResult.outputLabel}]`)
      ffmpegArgs.push('-map', '0:a?')
    }

    ffmpegArgs.push(
      '-c:v', 'libx264', '-preset', 'veryfast', '-maxrate', '4500k', '-bufsize', '9000k',
      '-pix_fmt', 'yuv420p', '-g', '60', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-f', 'flv',
      rtmpTarget,
    )

    const proc = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] })
    proc.stderr.on('data', (data) => {
      const msg = data.toString()
      if (msg.includes('Error') || msg.includes('error') || msg.includes('Opening')) {
        console.log(`[FFmpeg ${streamId}/${dest.id}] ${msg.trim()}`)
      }
    })
    proc.on('close', (code) => {
      console.log(`[2MStream] FFmpeg process for ${streamId}/${dest.id} exited with code ${code}`)
    })
    processes.push({ proc, destId: dest.id, killed: false })
  }

  activeStreams.set(streamId, {
    processes,
    destinations: updatedConfig.destinations,
    tempFiles,
    isPlaylist: updatedConfig.isPlaylist,
    isRtmpPull: updatedConfig.isRtmpPull,
    overlayCount: updatedConfig.overlays?.length || 0,
    config: updatedConfig,
  })

  res.json({
    success: true,
    streamId,
    overlayCount: updatedConfig.overlays?.length || 0,
    restarted: true,
  })
})

function stopStream(streamId) {
  const stream = activeStreams.get(streamId)
  if (!stream) return false

  console.log(`[2MStream] Stopping stream ${streamId}`)
  
  for (const p of stream.processes) {
    if (!p.proc.killed) {
      p.proc.kill('SIGTERM')
      setTimeout(() => {
        if (!p.proc.killed) {
          p.proc.kill('SIGKILL')
        }
      }, 5000)
    }
  }

  // Clean up temp files (concat files)
  if (stream.tempFiles) {
    for (const f of stream.tempFiles) {
      try { unlinkSync(f) } catch {}
    }
  }

  activeStreams.delete(streamId)
  return true
}

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('[2MStream] Shutting down, stopping all streams...')
  for (const [streamId] of activeStreams) {
    stopStream(streamId)
  }
  process.exit(0)
})

app.listen(PORT, () => {
  console.log(`[2MStream] Streaming engine listening on port ${PORT}`)
  console.log(`[2MStream] Video directory: ${VIDEO_DIR}`)
  console.log(`[2MStream] Supports: playlists, overlays (image + text), multi-destination`)
  console.log(`[2MStream] Waiting for stream commands...`)
})
