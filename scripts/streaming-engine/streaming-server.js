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
import { existsSync, writeFileSync, unlinkSync, mkdirSync, readdirSync, statSync, createWriteStream, createReadStream, readFileSync, rmdirSync } from 'fs'
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
  // Skip auth for /stream-video (it has its own auth: Bearer token or signed URL)
  if (req.path.startsWith('/stream-video')) return next()
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
async function downloadToTemp(url) {
  const { createWriteStream } = await import('fs')
  const { pipeline } = await import('stream/promises')
  const tempPath = join(tmpdir(), `overlay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  const ext = url.split('?')[0].split('.').pop() || 'png'
  const filePath = `${tempPath}.${ext}`
  
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to download overlay: ${response.status}`)
  
  const fileStream = createWriteStream(filePath)
  await pipeline(response.body, fileStream)
  
  console.log(`[2MStream] Downloaded overlay to: ${filePath}`)
  return filePath
}

function buildOverlayFilters(overlays) {
  if (!overlays || overlays.length === 0) return null

  const inputArgs = []
  const filters = []
  let currentLabel = '0:v'
  let inputIndex = 1 // 0 is the main video input

  for (let i = 0; i < overlays.length; i++) {
    const overlay = overlays[i]
    const outputLabel = `ov${i}`

    // Map position to FFmpeg overlay coordinates
    // positionX/positionY are 0-100% representing the CENTER of the overlay
    // Convert to top-left by: x = W*(px/100) - w/2, y = H*(py/100) - h/2
    // Clamp so the overlay stays fully on-screen
    let posCoords
    if (overlay.positionX !== undefined && overlay.positionY !== undefined) {
      const px = overlay.positionX / 100
      const py = overlay.positionY / 100
      posCoords = `x=max(0\\,min(W-w\\,round(W*${px}-w/2))):y=max(0\\,min(H-h\\,round(H*${py}-h/2)))`
    } else {
      // Legacy fallback: use preset position strings
      const posMap = {
        'top-left': 'x=10:y=10',
        'top-center': 'x=(W-w)/2:y=10',
        'top-right': 'x=W-w-10:y=10',
        'center': 'x=(W-w)/2:y=(H-h)/2',
        'bottom-left': 'x=10:y=H-h-10',
        'bottom-center': 'x=(W-w)/2:y=H-h-10',
        'bottom-right': 'x=W-w-10:y=H-h-10',
      }
      posCoords = posMap[overlay.position] || posMap['top-left']
    }

    if (overlay.type === 'scrolling_text') {
      // Scrolling ticker text using drawtext with scrolling x expression
      const escapedText = (overlay.textContent || '').replace(/'/g, "'\\''").replace(/:/g, '\\:')
      const fontSize = overlay.fontSize || 24
      const fontColor = overlay.fontColor || 'white'
      const bgColor = overlay.bgColor || '0x00000080'
      const speed = overlay.scrollSpeed || 100

      // Y position: use positionY if available, otherwise bottom of screen
      let scrollY
      if (overlay.positionY !== undefined) {
        scrollY = `h*${overlay.positionY / 100}-${fontSize / 2}`
      } else {
        scrollY = `h-${fontSize + 20}`
      }

      // Draw background bar (skip if transparent) then scrolling text
      const barHeight = fontSize + 16
      if (bgColor === 'transparent' || bgColor === 'none') {
        filters.push(
          `[${currentLabel}]drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${fontColor}:y=${scrollY}:x='W-mod(t*${speed}\\,W+tw)'[${outputLabel}]`
        )
      } else {
        filters.push(
          `[${currentLabel}]drawbox=x=0:y=${scrollY}-8:w=iw:h=${barHeight}:color=${bgColor}@0.7:t=fill[tickbg${i}]`,
          `[tickbg${i}]drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${fontColor}:y=${scrollY}:x='W-mod(t*${speed}\\,W+tw)'[${outputLabel}]`
        )
      }

      currentLabel = outputLabel
    } else if (overlay.type === 'text' || overlay.type === 'lower_third') {
      // Text overlay using drawtext filter
      const escapedText = (overlay.textContent || '').replace(/'/g, "'\\''").replace(/:/g, '\\:')
      const fontSize = overlay.fontSize || 24
      const fontColor = overlay.fontColor || 'white'
      
      if (overlay.type === 'lower_third') {
        // Lower third: box with background + text at bottom
        const bgColor = overlay.bgColor || '0x00000080'
        let ltY, ltTextY
        if (overlay.positionY !== undefined) {
          ltY = `ih*${overlay.positionY / 100}-${(fontSize + 30) / 2}`
          ltTextY = `h*${overlay.positionY / 100}-${fontSize / 2}`
        } else {
          ltY = `ih-${fontSize + 30}`
          ltTextY = `h-${fontSize + 15}`
        }
        const ltX = overlay.positionX !== undefined ? `iw*${overlay.positionX / 100}-iw/2` : '0'
        filters.push(
          `[${currentLabel}]drawbox=x=${ltX}:y=${ltY}:w=iw:h=${fontSize + 30}:color=${bgColor}@0.7:t=fill[bg${i}]`,
          `[bg${i}]drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${fontColor}:x=20:y=${ltTextY}[${outputLabel}]`
        )
      } else {
        // Regular text with X/Y percentage positioning
        let textX, textY
        if (overlay.positionX !== undefined && overlay.positionY !== undefined) {
          textX = `w*${overlay.positionX / 100}-tw/2`
          textY = `h*${overlay.positionY / 100}-th/2`
        } else {
          // Fallback to posCoords-based
          textX = posCoords.split(':')[0].replace('x=', '').replace('W', 'w').replace('w', 'w')
          textY = posCoords.split(':')[1]?.replace('y=', '').replace('H', 'h') || '10'
        }
        filters.push(
          `[${currentLabel}]drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${fontColor}:x=${textX}:y=${textY}[${outputLabel}]`
        )
      }
      currentLabel = outputLabel
    } else if (overlay.type === 'video' && overlay.videoPath) {
      // Video overlay (rotating logo, animation .MOV/.MP4)
      if (overlay.loopOverlay !== false) {
        inputArgs.push('-stream_loop', '-1')
      }
      inputArgs.push('-i', overlay.videoPath)
      
      const scalePercent = overlay.sizePercent || 20
      const opacityValue = (overlay.opacity || 100) / 100

      // Scale: use percentage of original size (iw*pct/100), keep aspect ratio
      const scaleFilter = `[${inputIndex}:v]scale=iw*${scalePercent}/100:-1,format=rgba,colorchannelmixer=aa=${opacityValue}[vid${i}]`
      filters.push(scaleFilter)
      filters.push(`[${currentLabel}][vid${i}]overlay=${posCoords}:shortest=0[${outputLabel}]`)
      
      currentLabel = outputLabel
      inputIndex++
    } else if (overlay.imagePath) {
      // Image overlay (logo, bug, image)
      inputArgs.push('-i', overlay.imagePath)
      
      const scalePercent = overlay.sizePercent || 20
      const opacityValue = (overlay.opacity || 100) / 100

      // Scale: use percentage of original size (iw*pct/100), keep aspect ratio
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
  const fileLines = []
  for (const src of videoSources) {
    const filePath = src.url || join(VIDEO_DIR, src.path || '')
    fileLines.push(`file '${filePath}'`)
  }
  
  // For looping playlists, repeat the file list many times (enough for ~48 hours)
  // -stream_loop does NOT work with the concat demuxer, so we repeat the list instead
  let lines = ["# FFmpeg concat demuxer file"]
  if (loop) {
    const repeatCount = Math.max(500, Math.ceil(172800 / (videoSources.length * 60))) // ~48hrs assuming 60s avg per video
    for (let i = 0; i < repeatCount; i++) {
      lines.push(...fileLines)
    }
    console.log(`[2MStream] Concat file: ${fileLines.length} files repeated ${repeatCount}x for looping`)
  } else {
    lines.push(...fileLines)
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
 * POST /check-rtmp
 * Body: { url: "rtmp://..." }
 * Validates that an RTMP stream is reachable using ffprobe.
 */
app.post('/check-rtmp', (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'Missing url' })

  // Validate it looks like an RTMP URL
  if (!url.startsWith('rtmp://') && !url.startsWith('rtmps://')) {
    return res.json({ valid: false, error: 'URL must start with rtmp:// or rtmps://' })
  }

  // Use ffprobe with a short timeout to check if the stream is accessible
  const proc = spawn('ffprobe', [
    '-v', 'quiet',
    '-rw_timeout', '5000000',     // 5 second timeout
    '-print_format', 'json',
    '-show_streams',
    url,
  ], { timeout: 10000 })

  let stdout = ''
  let stderr = ''

  proc.stdout.on('data', (data) => { stdout += data.toString() })
  proc.stderr.on('data', (data) => { stderr += data.toString() })

  proc.on('close', (code) => {
    if (code === 0) {
      try {
        const info = JSON.parse(stdout)
        const streams = info.streams || []
        const hasVideo = streams.some((s) => s.codec_type === 'video')
        const hasAudio = streams.some((s) => s.codec_type === 'audio')
        res.json({
          valid: true,
          hasVideo,
          hasAudio,
          streamCount: streams.length,
          info: streams.map((s) => ({
            type: s.codec_type,
            codec: s.codec_name,
            resolution: s.width ? `${s.width}x${s.height}` : undefined,
          })),
        })
      } catch {
        res.json({ valid: true, hasVideo: true, hasAudio: false })
      }
    } else {
      res.json({
        valid: false,
        error: 'Stream not reachable or not active. Make sure the source is streaming.',
      })
    }
  })

  proc.on('error', () => {
    res.json({ valid: false, error: 'ffprobe failed to execute' })
  })
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
app.post('/start', async (req, res) => {
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
    // Note: -reconnect flags are HTTP-only, not RTMP compatible. Auto-restart handles reconnection.
    console.log(`[2MStream] RTMP Pull mode from: ${rtmpPullUrl}`)
    inputArgs = [
      '-rw_timeout', '10000000', // 10s timeout for RTMP connection
      '-i', rtmpPullUrl,
    ]
  } else if (isPlaylist && videoSources && videoSources.length >= 1) {
    // Playlist mode: use concat demuxer with genpts to handle timestamp resets between files
    const concatFile = createConcatFile(videoSources, loop)
    tempFiles.push(concatFile)
    
    inputArgs = [
      '-re',
      '-fflags', '+genpts+discardcorrupt+nobuffer',
      '-f', 'concat',
      '-safe', '0',
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

    if (loop) {
      const singleSource = [{ url: source?.url, path: source?.path || videoPath }]
      const concatFile = createConcatFile(singleSource, true)
      tempFiles.push(concatFile)
      inputArgs = [
        '-re',
        '-fflags', '+genpts+discardcorrupt+nobuffer',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatFile,
      ]
    } else {
      inputArgs = [
        '-re',
        '-i', inputSource,
      ]
    }
  }

  // Download remote overlay images to local temp files for FFmpeg
  if (overlays && overlays.length > 0) {
    console.log(`[2MStream] Processing ${overlays.length} overlay(s)...`)
    for (const overlay of overlays) {
      console.log(`[2MStream] Overlay ${overlay.id}: type=${overlay.type}, imagePath=${overlay.imagePath ? overlay.imagePath.slice(0, 80) : 'none'}, videoPath=${overlay.videoPath ? overlay.videoPath.slice(0, 80) : 'none'}`)
      try {
        if (overlay.imagePath && overlay.imagePath.startsWith('http')) {
          console.log(`[2MStream] Downloading overlay image: ${overlay.imagePath.slice(0, 100)}...`)
          const localPath = await downloadToTemp(overlay.imagePath)
          tempFiles.push(localPath)
          overlay.imagePath = localPath
          console.log(`[2MStream] Overlay image saved to: ${localPath}`)
        }
        if (overlay.videoPath && overlay.videoPath.startsWith('http')) {
          console.log(`[2MStream] Downloading overlay video: ${overlay.videoPath.slice(0, 100)}...`)
          const localPath = await downloadToTemp(overlay.videoPath)
          tempFiles.push(localPath)
          overlay.videoPath = localPath
          console.log(`[2MStream] Overlay video saved to: ${localPath}`)
        }
      } catch (dlErr) {
        console.error(`[2MStream] Overlay download failed for ${overlay.id}:`, dlErr.message)
        // Null out the path so FFmpeg skips this overlay
        overlay.imagePath = null
        overlay.videoPath = null
      }
    }
  }

  // Build overlay filters
  const overlayResult = buildOverlayFilters(overlays)

  const processes = []
  const errors = []

  // Start one FFmpeg process per destination
  for (const dest of destinations) {
    const rtmpTarget = `${dest.rtmpUrl}/${dest.streamKey}`
    
    let ffmpegArgs = [...inputArgs]

    // Normalize video: scale to 1080p, pad to fit, but do NOT force fps (too CPU expensive)
    const videoNorm = 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1'

    if (overlayResult) {
      ffmpegArgs.push(...overlayResult.inputArgs)
      const overlayChain = overlayResult.filterComplex.replace('[0:v]', '[norm]')
      const combinedFilter = `[0:v]${videoNorm}[norm];${overlayChain}`
      ffmpegArgs.push('-filter_complex', combinedFilter)
      ffmpegArgs.push('-map', `[${overlayResult.outputLabel}]`)
      ffmpegArgs.push('-map', '0:a?')
    } else {
      ffmpegArgs.push('-vf', videoNorm)
    }

    ffmpegArgs.push(
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-b:v', '3000k',
      '-maxrate', '3000k',
      '-bufsize', '6000k',
      '-pix_fmt', 'yuv420p',
      '-g', '60',
      '-keyint_min', '60',
      '-sc_threshold', '0',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-ac', '2',
      '-f', 'flv',
      '-flvflags', 'no_duration_filesize',
      rtmpTarget,
    )

    console.log(`[2MStream] Starting FFmpeg for stream ${streamId} -> ${dest.name || rtmpTarget}`)
    console.log(`[2MStream] FFmpeg args: ffmpeg ${ffmpegArgs.join(' ')}`)
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
      if (msg.includes('Error') || msg.includes('error') || msg.includes('Opening') || msg.includes('No such file') || msg.includes('Invalid')) {
        console.log(`[FFmpeg ${streamId}/${dest.id}] ${msg.trim()}`)
      }
    })

    // Recursive auto-restart function that keeps the stream alive
    function setupAutoRestart(ffmpegProc, procEntry) {
      ffmpegProc.on('close', (code) => {
        console.log(`[2MStream] FFmpeg for ${streamId}/${dest.id} exited code=${code}`)
        if (code !== 0) {
          const lastLines = (procEntry._stderrBuf || '').slice(-500).trim()
          if (lastLines) console.error(`[FFmpeg ${streamId}/${dest.id}] ${lastLines}`)
        }
        // Auto-restart if not manually stopped
        const streamEntry = activeStreams.get(streamId)
        if (!streamEntry || streamEntry.stopping || procEntry.killed) return
        procEntry.restartCount = (procEntry.restartCount || 0) + 1
        if (procEntry.restartCount > 100) {
          console.error(`[2MStream] ${streamId}/${dest.id} exceeded 100 restarts, giving up`)
          return
        }
        // Quick restart (2s) - the stream normalization handles file transitions
        const delay = code === 0 ? 1000 : Math.min(3000 * procEntry.restartCount, 15000)
        console.log(`[2MStream] Auto-restarting ${streamId}/${dest.id} in ${delay/1000}s (attempt ${procEntry.restartCount})`)
        setTimeout(() => {
          const current = activeStreams.get(streamId)
          if (!current || current.stopping) return
          try {
            const newProc = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] })
            procEntry._stderrBuf = ''
            newProc.stderr.on('data', (d) => {
              const m = d.toString()
              procEntry._stderrBuf = (procEntry._stderrBuf || '').slice(-2000) + m
              if (m.includes('Error') || m.includes('error') || m.includes('No such file')) {
                console.log(`[FFmpeg ${streamId}/${dest.id}] ${m.trim()}`)
              }
            })
            newProc.on('error', (err) => {
              console.error(`[2MStream] FFmpeg spawn error: ${err.message}`)
            })
            procEntry.proc = newProc
            procEntry.killed = false
            // Recursively set up auto-restart for the new process
            setupAutoRestart(newProc, procEntry)
          } catch (e) {
            console.error(`[2MStream] Restart failed: ${e.message}`)
          }
        }, delay)
      })
    }

    const procEntry = { proc, destId: dest.id, killed: false, restartCount: 0, _stderrBuf: '' }
    setupAutoRestart(proc, procEntry)

    proc.on('error', (err) => {
      console.error(`[2MStream] FFmpeg spawn error for ${streamId}/${dest.id}:`, err.message)
      errors.push({ destinationId: dest.id, error: err.message })
    })

    processes.push(procEntry)
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
 * POST /preview
 * Body: { videoSource, overlays, isPlaylist, videoSources }
 * Generates a 5-second preview clip with overlays applied.
 * Returns the clip as an MP4 file for browser playback.
 */
app.post('/preview', async (req, res) => {
  const { videoSource, videoSources, overlays, isPlaylist } = req.body

  const previewId = `preview-${Date.now()}`
  const outputFile = join(tmpdir(), `${previewId}.mp4`)
  const tempFiles = [outputFile]

  // Build input args
  let inputArgs = []
  if (isPlaylist && videoSources?.length > 1) {
    const concatFile = createConcatFile(videoSources, false)
    tempFiles.push(concatFile)
    inputArgs = ['-re', '-f', 'concat', '-safe', '0', '-i', concatFile]
  } else {
    const source = videoSources?.[0] || {}
    const inputSource = source.url || videoSource || join(VIDEO_DIR, source.path || '')
    // Check if it's RTMP (don't use -re for live sources)
    if (inputSource.startsWith('rtmp://') || inputSource.startsWith('rtmps://')) {
      inputArgs = ['-rw_timeout', '10000000', '-i', inputSource]
    } else {
      inputArgs = ['-i', inputSource]
    }
  }

  const overlayResult = buildOverlayFilters(overlays || [])

  let ffmpegArgs = [...inputArgs]
  if (overlayResult) {
    ffmpegArgs.push(...overlayResult.inputArgs)
    ffmpegArgs.push('-filter_complex', overlayResult.filterComplex)
    ffmpegArgs.push('-map', `[${overlayResult.outputLabel}]`)
    ffmpegArgs.push('-map', '0:a?')
  }

  // Output 5 seconds as MP4
  ffmpegArgs.push(
    '-t', '5',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    '-y', outputFile,
  )

  console.log(`[2MStream] Generating preview ${previewId}`)

  const proc = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] })
  let stderr = ''
  proc.stderr.on('data', (data) => { stderr += data.toString() })

  proc.on('close', (code) => {
    if (code === 0 && existsSync(outputFile)) {
      res.setHeader('Content-Type', 'video/mp4')
      res.setHeader('Content-Disposition', `inline; filename="${previewId}.mp4"`)
      const stat = statSync(outputFile)
      res.setHeader('Content-Length', stat.size)

      const stream = require('fs').createReadStream(outputFile)
      stream.pipe(res)
      stream.on('end', () => {
        // Clean up temp files
        tempFiles.forEach(f => { try { unlinkSync(f) } catch {} })
      })
    } else {
      console.error(`[2MStream] Preview generation failed:`, stderr.slice(-500))
      tempFiles.forEach(f => { try { unlinkSync(f) } catch {} })
      res.status(500).json({ error: 'Preview generation failed', detail: stderr.slice(-300) })
    }
  })

  proc.on('error', (err) => {
    tempFiles.forEach(f => { try { unlinkSync(f) } catch {} })
    res.status(500).json({ error: 'FFmpeg failed', detail: err.message })
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
    inputArgs = [
      '-rw_timeout', '10000000',
      '-i', updatedConfig.rtmpPullUrl,
    ]
  } else if (updatedConfig.isPlaylist && updatedConfig.videoSources?.length >= 1) {
    const concatFile = createConcatFile(updatedConfig.videoSources, updatedConfig.loop)
    tempFiles.push(concatFile)
    inputArgs = ['-re', '-fflags', '+genpts+discardcorrupt+nobuffer', '-f', 'concat', '-safe', '0', '-i', concatFile]
  } else {
    const source = updatedConfig.videoSources?.[0]
    const inputSource = source?.url || updatedConfig.videoUrl || join(VIDEO_DIR, source?.path || updatedConfig.videoPath || '')
    if (updatedConfig.loop) {
      const singleSource = [{ url: source?.url, path: source?.path || updatedConfig.videoPath }]
      const concatFile = createConcatFile(singleSource, true)
      tempFiles.push(concatFile)
      inputArgs = ['-re', '-fflags', '+genpts+discardcorrupt+nobuffer', '-f', 'concat', '-safe', '0', '-i', concatFile]
    } else {
      inputArgs = ['-re', '-i', inputSource]
    }
  }

  const overlayResult = buildOverlayFilters(updatedConfig.overlays)
  const processes = []

  for (const dest of updatedConfig.destinations) {
    const rtmpTarget = `${dest.rtmpUrl}/${dest.streamKey}`
    let ffmpegArgs = [...inputArgs]

    const videoNorm = 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1'

    if (overlayResult) {
      ffmpegArgs.push(...overlayResult.inputArgs)
      const overlayChain = overlayResult.filterComplex.replace('[0:v]', '[norm]')
      const combinedFilter = `[0:v]${videoNorm}[norm];${overlayChain}`
      ffmpegArgs.push('-filter_complex', combinedFilter)
      ffmpegArgs.push('-map', `[${overlayResult.outputLabel}]`)
      ffmpegArgs.push('-map', '0:a?')
    } else {
      ffmpegArgs.push('-vf', videoNorm)
    }

    ffmpegArgs.push(
      '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
      '-b:v', '3000k', '-maxrate', '3000k', '-bufsize', '6000k',
      '-pix_fmt', 'yuv420p', '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
      '-f', 'flv', '-flvflags', 'no_duration_filesize',
      rtmpTarget,
    )

    const proc = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] })
    proc.stderr.on('data', (data) => {
      const msg = data.toString()
      if (msg.includes('Error') || msg.includes('error') || msg.includes('Opening')) {
        console.log(`[FFmpeg ${streamId}/${dest.id}] ${msg.trim()}`)
      }
    })

    // Auto-restart for restarted processes too
    function setupRestartAutoRestart(ffmpegProc, procEntry) {
      ffmpegProc.on('close', (code) => {
        console.log(`[2MStream] FFmpeg for ${streamId}/${dest.id} exited code=${code}`)
        const streamEntry = activeStreams.get(streamId)
        if (!streamEntry || streamEntry.stopping || procEntry.killed) return
        procEntry.restartCount = (procEntry.restartCount || 0) + 1
        if (procEntry.restartCount > 100) return
        const delay = code === 0 ? 1000 : Math.min(3000 * procEntry.restartCount, 15000)
        console.log(`[2MStream] Auto-restarting ${streamId}/${dest.id} in ${delay/1000}s (attempt ${procEntry.restartCount})`)
        setTimeout(() => {
          const current = activeStreams.get(streamId)
          if (!current || current.stopping) return
          try {
            const newProc = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] })
            newProc.stderr.on('data', (d) => {
              const m = d.toString()
              if (m.includes('Error') || m.includes('error')) console.log(`[FFmpeg ${streamId}/${dest.id}] ${m.trim()}`)
            })
            newProc.on('error', (err) => console.error(`[2MStream] FFmpeg spawn error: ${err.message}`))
            procEntry.proc = newProc
            procEntry.killed = false
            setupRestartAutoRestart(newProc, procEntry)
          } catch (e) {
            console.error(`[2MStream] Restart failed: ${e.message}`)
          }
        }, delay)
      })
    }

    const procEntry = { proc, destId: dest.id, killed: false, restartCount: 0 }
    setupRestartAutoRestart(proc, procEntry)
    processes.push(procEntry)
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
  
  // Mark as stopping so auto-restart doesn't trigger
  stream.stopping = true
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
