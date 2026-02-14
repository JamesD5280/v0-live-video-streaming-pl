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
import { existsSync } from 'fs'
import { join } from 'path'

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 3001
const API_SECRET = process.env.API_SECRET || 'change-this-secret'
const VIDEO_DIR = process.env.VIDEO_DIR || './videos'

// Active FFmpeg processes: streamId -> { process, destinations[] }
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
      running: info.processes.some(p => !p.killed),
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
 * POST /start
 * Body: {
 *   streamId: "uuid",
 *   videoUrl: "https://..." or videoPath: "local-file.mp4",
 *   destinations: [{ id, rtmpUrl, streamKey }],
 *   loop: true/false
 * }
 */
app.post('/start', (req, res) => {
  const { streamId, videoUrl, videoPath, destinations, loop = true } = req.body

  if (!streamId || !destinations || destinations.length === 0) {
    return res.status(400).json({ error: 'Missing streamId or destinations' })
  }

  // Stop existing stream if running
  if (activeStreams.has(streamId)) {
    stopStream(streamId)
  }

  const inputSource = videoUrl || join(VIDEO_DIR, videoPath || '')

  // If it's a local file, verify it exists
  if (!videoUrl && videoPath && !existsSync(inputSource)) {
    return res.status(400).json({ error: `Video file not found: ${inputSource}` })
  }

  const processes = []
  const errors = []

  // Start one FFmpeg process per destination
  for (const dest of destinations) {
    const rtmpTarget = `${dest.rtmpUrl}/${dest.streamKey}`
    
    const ffmpegArgs = [
      '-re',                          // Read at native framerate (simulates live)
      ...(loop ? ['-stream_loop', '-1'] : []), // Loop the video
      '-i', inputSource,              // Input file or URL
      '-c:v', 'libx264',             // H.264 video codec
      '-preset', 'veryfast',          // Fast encoding
      '-maxrate', '4500k',            // Max bitrate
      '-bufsize', '9000k',            // Buffer size
      '-pix_fmt', 'yuv420p',          // Pixel format
      '-g', '60',                     // Keyframe interval (2 seconds at 30fps)
      '-c:a', 'aac',                  // AAC audio codec
      '-b:a', '128k',                 // Audio bitrate
      '-ar', '44100',                 // Audio sample rate
      '-f', 'flv',                    // FLV output format for RTMP
      rtmpTarget,
    ]

    console.log(`[2MStream] Starting FFmpeg for stream ${streamId} -> ${dest.name || rtmpTarget}`)
    
    const proc = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] })

    proc.stderr.on('data', (data) => {
      const msg = data.toString()
      // Only log important messages, not the verbose progress
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

  activeStreams.set(streamId, { processes, destinations })

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
    destinations: destStatuses,
  })
})

function stopStream(streamId) {
  const stream = activeStreams.get(streamId)
  if (!stream) return false

  console.log(`[2MStream] Stopping stream ${streamId}`)
  
  for (const p of stream.processes) {
    if (!p.proc.killed) {
      p.proc.kill('SIGTERM')
      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (!p.proc.killed) {
          p.proc.kill('SIGKILL')
        }
      }, 5000)
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
  console.log(`[2MStream] Waiting for stream commands...`)
})
