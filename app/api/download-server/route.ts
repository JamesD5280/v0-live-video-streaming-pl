import { NextRequest } from "next/server"

/**
 * GET /api/download-server?file=streaming-server.js
 * GET /api/download-server?file=package.json
 *
 * Public endpoint (no auth) to download streaming engine files.
 * The file content is embedded directly so there are no filesystem issues.
 */
export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get("file")

  if (file === "package.json") {
    const packageJson = JSON.stringify({
      name: "2mstream-streaming-engine",
      version: "1.0.0",
      type: "module",
      scripts: { start: "node streaming-server.js" },
      dependencies: { express: "^4.18.2", cors: "^2.8.5" }
    }, null, 2)
    return new Response(packageJson, {
      headers: { "Content-Type": "application/json" },
    })
  }

  if (file === "streaming-server.js" || !file) {
    // Fetch the file from the repo's raw content embedded at build time
    // We read it from the project's own filesystem at build
    const serverCode = `/**
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
import { existsSync, writeFileSync, unlinkSync, mkdirSync, readdirSync, statSync, createWriteStream, createReadStream, readFileSync } from 'fs'
import { join, basename } from 'path'
import { tmpdir } from 'os'
import { pipeline } from 'stream/promises'
import { createHmac } from 'crypto'

const app = express()
app.use(cors())
app.use((req, res, next) => {
  if (req.path === '/upload' || req.path === '/upload/chunk') return next()
  express.json({ limit: '1mb' })(req, res, next)
})

const PORT = process.env.PORT || 3001
const API_SECRET = process.env.API_SECRET || 'change-this-secret'
const VIDEO_DIR = process.env.VIDEO_DIR || './videos'

const activeStreams = new Map()

function authenticate(req, res, next) {
  if (req.path.startsWith('/stream-video')) return next()
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (token !== API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

app.use(authenticate)

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

function buildOverlayFilters(overlays) {
  if (!overlays || overlays.length === 0) return null

  const inputArgs = []
  const filters = []
  let currentLabel = '0:v'
  let inputIndex = 1

  for (let i = 0; i < overlays.length; i++) {
    const overlay = overlays[i]
    const outputLabel = \`ov\${i}\`

    let posCoords
    if (overlay.positionX !== undefined && overlay.positionY !== undefined) {
      const px = overlay.positionX / 100
      const py = overlay.positionY / 100
      posCoords = \`x=max(0\\\\,min(W-w\\\\,W*\${px}-w/2)):y=max(0\\\\,min(H-h\\\\,H*\${py}-h/2))\`
    } else {
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
      const escapedText = (overlay.textContent || '').replace(/'/g, "'\\\\''").replace(/:/g, '\\\\:')
      const fontSize = overlay.fontSize || 24
      const fontColor = overlay.fontColor || 'white'
      const bgColor = overlay.bgColor || '0x00000080'
      const speed = overlay.scrollSpeed || 100

      let scrollY
      if (overlay.positionY !== undefined) {
        scrollY = \`h*\${overlay.positionY / 100}-\${fontSize / 2}\`
      } else {
        scrollY = \`h-\${fontSize + 20}\`
      }

      const barHeight = fontSize + 16
      filters.push(
        \`[\${currentLabel}]drawbox=x=0:y=\${scrollY}-8:w=iw:h=\${barHeight}:color=\${bgColor}@0.7:t=fill[tickbg\${i}]\`,
        \`[tickbg\${i}]drawtext=text='\${escapedText}':fontsize=\${fontSize}:fontcolor=\${fontColor}:y=\${scrollY}:x='W-mod(t*\${speed}\\\\,W+tw)'[\${outputLabel}]\`
      )

      currentLabel = outputLabel
    } else if (overlay.type === 'text' || overlay.type === 'lower_third') {
      const escapedText = (overlay.textContent || '').replace(/'/g, "'\\\\''").replace(/:/g, '\\\\:')
      const fontSize = overlay.fontSize || 24
      const fontColor = overlay.fontColor || 'white'
      
      if (overlay.type === 'lower_third') {
        const bgColor = overlay.bgColor || '0x00000080'
        let ltY, ltTextY
        if (overlay.positionY !== undefined) {
          ltY = \`ih*\${overlay.positionY / 100}-\${(fontSize + 30) / 2}\`
          ltTextY = \`h*\${overlay.positionY / 100}-\${fontSize / 2}\`
        } else {
          ltY = \`ih-\${fontSize + 30}\`
          ltTextY = \`h-\${fontSize + 15}\`
        }
        const ltX = overlay.positionX !== undefined ? \`iw*\${overlay.positionX / 100}-iw/2\` : '0'
        filters.push(
          \`[\${currentLabel}]drawbox=x=\${ltX}:y=\${ltY}:w=iw:h=\${fontSize + 30}:color=\${bgColor}@0.7:t=fill[bg\${i}]\`,
          \`[bg\${i}]drawtext=text='\${escapedText}':fontsize=\${fontSize}:fontcolor=\${fontColor}:x=20:y=\${ltTextY}[\${outputLabel}]\`
        )
      } else {
        let textX, textY
        if (overlay.positionX !== undefined && overlay.positionY !== undefined) {
          textX = \`w*\${overlay.positionX / 100}-tw/2\`
          textY = \`h*\${overlay.positionY / 100}-th/2\`
        } else {
          textX = posCoords.split(':')[0].replace('x=', '').replace('W', 'w').replace('w', 'w')
          textY = posCoords.split(':')[1]?.replace('y=', '').replace('H', 'h') || '10'
        }
        filters.push(
          \`[\${currentLabel}]drawtext=text='\${escapedText}':fontsize=\${fontSize}:fontcolor=\${fontColor}:x=\${textX}:y=\${textY}[\${outputLabel}]\`
        )
      }
      currentLabel = outputLabel
    } else if (overlay.type === 'video' && overlay.videoPath) {
      if (overlay.loopOverlay !== false) {
        inputArgs.push('-stream_loop', '-1')
      }
      inputArgs.push('-i', overlay.videoPath)
      
      const scalePercent = overlay.sizePercent || 15
      const opacityValue = (overlay.opacity || 100) / 100

      const scaleFilter = \`[\${inputIndex}:v]scale=iw*\${scalePercent}/100:-1,format=rgba,colorchannelmixer=aa=\${opacityValue}[vid\${i}]\`
      filters.push(scaleFilter)
      filters.push(\`[\${currentLabel}][vid\${i}]overlay=\${posCoords}:shortest=0[\${outputLabel}]\`)
      
      currentLabel = outputLabel
      inputIndex++
    } else if (overlay.imagePath) {
      inputArgs.push('-i', overlay.imagePath)
      
      const scalePercent = overlay.sizePercent || 15
      const opacityValue = (overlay.opacity || 100) / 100

      const scaleFilter = \`[\${inputIndex}:v]scale=iw*\${scalePercent}/100:-1,format=rgba,colorchannelmixer=aa=\${opacityValue}[img\${i}]\`
      filters.push(scaleFilter)
      filters.push(\`[\${currentLabel}][img\${i}]overlay=\${posCoords}[\${outputLabel}]\`)
      
      currentLabel = outputLabel
      inputIndex++
    }
  }

  if (filters.length === 0) return null

  return {
    inputArgs,
    filterComplex: filters.join(';'),
    outputLabel: currentLabel,
  }
}

function createConcatFile(videoSources, loop) {
  const lines = ["# FFmpeg concat demuxer file"]
  for (const src of videoSources) {
    const path = src.url || join(VIDEO_DIR, src.path || '')
    lines.push(\`file '\${path}'\`)
  }
  
  const concatPath = join(tmpdir(), \`2mstream-concat-\${Date.now()}.txt\`)
  writeFileSync(concatPath, lines.join('\\n'))
  return concatPath
}

mkdirSync(VIDEO_DIR, { recursive: true })

app.post('/upload', async (req, res) => {
  const filename = req.headers['x-filename'] || \`upload-\${Date.now()}.mp4\`
  const safeFilename = basename(String(filename))
  const destPath = join(VIDEO_DIR, safeFilename)

  console.log(\`[2MStream] Receiving upload: \${safeFilename}\`)

  try {
    const writeStream = createWriteStream(destPath)
    let received = 0

    req.on('data', (chunk) => {
      received += chunk.length
    })

    await pipeline(req, writeStream)

    const sizeMB = (received / (1024 * 1024)).toFixed(1)
    console.log(\`[2MStream] Upload complete: \${safeFilename} (\${sizeMB} MB)\`)

    res.json({ 
      success: true, 
      filename: safeFilename, 
      path: destPath,
      size: received,
    })
  } catch (err) {
    console.error(\`[2MStream] Upload failed for \${safeFilename}:\`, err.message)
    try { unlinkSync(destPath) } catch {}
    res.status(500).json({ error: \`Upload failed: \${err.message}\` })
  }
})

const chunkedUploads = new Map()

app.post('/upload/chunk', async (req, res) => {
  const filename = req.headers['x-filename'] || \`upload-\${Date.now()}.mp4\`
  const uploadId = req.headers['x-upload-id'] || \`default-\${Date.now()}\`
  const chunkIndex = parseInt(req.headers['x-chunk-index'] || '0', 10)
  const totalChunks = parseInt(req.headers['x-total-chunks'] || '1', 10)
  const safeFilename = basename(String(filename))

  try {
    if (!chunkedUploads.has(uploadId)) {
      const tempDir = join(tmpdir(), \`2mstream-upload-\${uploadId}\`)
      mkdirSync(tempDir, { recursive: true })
      chunkedUploads.set(uploadId, {
        filename: safeFilename,
        receivedChunks: new Set(),
        totalChunks,
        tempDir,
      })
    }

    const upload = chunkedUploads.get(uploadId)
    const chunkPath = join(upload.tempDir, \`chunk-\${String(chunkIndex).padStart(6, '0')}\`)

    const writeStream = createWriteStream(chunkPath)
    await pipeline(req, writeStream)
    upload.receivedChunks.add(chunkIndex)

    console.log(\`[2MStream] Chunk \${chunkIndex + 1}/\${totalChunks} received for \${safeFilename}\`)

    if (upload.receivedChunks.size === totalChunks) {
      const destPath = join(VIDEO_DIR, safeFilename)
      const finalStream = createWriteStream(destPath)
      
      for (let i = 0; i < totalChunks; i++) {
        const cp = join(upload.tempDir, \`chunk-\${String(i).padStart(6, '0')}\`)
        const data = readFileSync(cp)
        finalStream.write(data)
        try { unlinkSync(cp) } catch {}
      }
      finalStream.end()

      await new Promise((resolve, reject) => {
        finalStream.on('finish', resolve)
        finalStream.on('error', reject)
      })

      try { 
        const { rmdirSync } = await import('fs')
        rmdirSync(upload.tempDir) 
      } catch {}
      chunkedUploads.delete(uploadId)

      const stats = statSync(destPath)
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(1)
      console.log(\`[2MStream] Upload assembled: \${safeFilename} (\${sizeMB} MB)\`)

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
    console.error(\`[2MStream] Chunk upload failed:\`, err.message)
    res.status(500).json({ error: \`Chunk upload failed: \${err.message}\` })
  }
})

app.get('/videos', (req, res) => {
  try {
    const files = readdirSync(VIDEO_DIR)
      .filter(f => /\\.(mp4|mkv|mov|avi|flv|ts|webm)$/i.test(f))
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

app.post('/check-rtmp', (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'Missing url' })

  if (!url.startsWith('rtmp://') && !url.startsWith('rtmps://')) {
    return res.json({ valid: false, error: 'URL must start with rtmp:// or rtmps://' })
  }

  const proc = spawn('ffprobe', [
    '-v', 'quiet',
    '-rw_timeout', '5000000',
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
            resolution: s.width ? \`\${s.width}x\${s.height}\` : undefined,
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

app.get('/stream-video/:filename', (req, res) => {
  const { token, expires } = req.query
  const bearerAuth = req.headers.authorization
  
  if (token && expires) {
    const filename = basename(req.params.filename)
    const payload = \`\${filename}:\${expires}\`
    const expected = createHmac('sha256', API_SECRET).update(payload).digest('hex')
    if (token !== expected || Date.now() > parseInt(expires, 10)) {
      return res.status(403).json({ error: 'Invalid or expired token' })
    }
  } else if (!bearerAuth || bearerAuth !== \`Bearer \${API_SECRET}\`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const safeFilename = basename(req.params.filename)
  const filePath = join(VIDEO_DIR, safeFilename)

  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' })
  }

  const stat = statSync(filePath)
  const fileSize = stat.size

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
    const parts = range.replace(/bytes=/, '').split('-')
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
    const chunkSize = end - start + 1

    const stream = createReadStream(filePath, { start, end })

    res.writeHead(206, {
      'Content-Range': \`bytes \${start}-\${end}/\${fileSize}\`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
    })
    stream.pipe(res)
  } else {
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
    console.log(\`[2MStream] Deleted video: \${safeFilename}\`)
    res.json({ success: true, filename: safeFilename })
  } catch (err) {
    console.error(\`[2MStream] Failed to delete \${safeFilename}:\`, err.message)
    res.status(500).json({ error: \`Failed to delete: \${err.message}\` })
  }
})

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

  if (activeStreams.has(streamId)) {
    stopStream(streamId)
  }

  const tempFiles = []

  let inputArgs = []

  if (isRtmpPull && rtmpPullUrl) {
    console.log(\`[2MStream] RTMP Pull mode from: \${rtmpPullUrl}\`)
    inputArgs = [
      '-rw_timeout', '10000000',
      '-i', rtmpPullUrl,
    ]
  } else if (isPlaylist && videoSources && videoSources.length > 1) {
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
    const source = videoSources?.[0]
    const inputSource = source?.url || videoUrl || join(VIDEO_DIR, source?.path || videoPath || '')

    if (!source?.url && !videoUrl) {
      const localPath = join(VIDEO_DIR, source?.path || videoPath || '')
      if (!existsSync(localPath)) {
        return res.status(400).json({ error: \`Video file not found: \${localPath}\` })
      }
    }

    inputArgs = [
      '-re',
      ...(loop ? ['-stream_loop', '-1'] : []),
      '-i', inputSource,
    ]
  }

  const overlayResult = buildOverlayFilters(overlays)

  const processes = []
  const errors = []

  for (const dest of destinations) {
    const rtmpTarget = \`\${dest.rtmpUrl}/\${dest.streamKey}\`
    
    let ffmpegArgs = [...inputArgs]

    if (overlayResult) {
      ffmpegArgs.push(...overlayResult.inputArgs)
      ffmpegArgs.push('-filter_complex', overlayResult.filterComplex)
      ffmpegArgs.push('-map', \`[\${overlayResult.outputLabel}]\`)
      ffmpegArgs.push('-map', '0:a?')
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

    console.log(\`[2MStream] Starting FFmpeg for stream \${streamId} -> \${dest.name || rtmpTarget}\`)
    if (overlays?.length > 0) {
      console.log(\`[2MStream]   with \${overlays.length} overlay(s)\`)
    }
    if (isPlaylist && videoSources?.length > 1) {
      console.log(\`[2MStream]   playlist mode: \${videoSources.length} videos, loop=\${loop}\`)
    }
    if (isRtmpPull) {
      console.log(\`[2MStream]   RTMP pull mode from: \${rtmpPullUrl}\`)
    }
    
    const proc = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] })

    proc.stderr.on('data', (data) => {
      const msg = data.toString()
      if (msg.includes('Error') || msg.includes('error') || msg.includes('Opening')) {
        console.log(\`[FFmpeg \${streamId}/\${dest.id}] \${msg.trim()}\`)
      }
    })

    proc.on('close', (code) => {
      console.log(\`[2MStream] FFmpeg process for \${streamId}/\${dest.id} exited with code \${code}\`)
    })

    proc.on('error', (err) => {
      console.error(\`[2MStream] FFmpeg spawn error for \${streamId}/\${dest.id}:\`, err.message)
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

  setTimeout(() => {
    const stream = activeStreams.get(streamId)
    if (!stream) return
    const running = stream.processes.filter(p => !p.proc.killed)
    console.log(\`[2MStream] Stream \${streamId}: \${running.length}/\${stream.processes.length} destinations connected\`)
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

app.post('/stop', (req, res) => {
  const { streamId } = req.body

  if (!streamId) {
    return res.status(400).json({ error: 'Missing streamId' })
  }

  const stopped = stopStream(streamId)
  res.json({ success: true, streamId, wasStopped: stopped })
})

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

app.post('/preview', async (req, res) => {
  const { videoSource, videoSources, overlays, isPlaylist } = req.body

  const previewId = \`preview-\${Date.now()}\`
  const outputFile = join(tmpdir(), \`\${previewId}.mp4\`)
  const tempFiles = [outputFile]

  let inputArgs = []
  if (isPlaylist && videoSources?.length > 1) {
    const concatFile = createConcatFile(videoSources, false)
    tempFiles.push(concatFile)
    inputArgs = ['-re', '-f', 'concat', '-safe', '0', '-i', concatFile]
  } else {
    const source = videoSources?.[0] || {}
    const inputSource = source.url || videoSource || join(VIDEO_DIR, source.path || '')
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
    ffmpegArgs.push('-map', \`[\${overlayResult.outputLabel}]\`)
    ffmpegArgs.push('-map', '0:a?')
  }

  ffmpegArgs.push(
    '-t', '5',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    '-y', outputFile,
  )

  console.log(\`[2MStream] Generating preview \${previewId}\`)

  const proc = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] })
  let stderr = ''
  proc.stderr.on('data', (data) => { stderr += data.toString() })

  proc.on('close', (code) => {
    if (code === 0 && existsSync(outputFile)) {
      res.setHeader('Content-Type', 'video/mp4')
      res.setHeader('Content-Disposition', \`inline; filename="\${previewId}.mp4"\`)
      const stat = statSync(outputFile)
      res.setHeader('Content-Length', stat.size)

      const fileStream = createReadStream(outputFile)
      fileStream.pipe(res)
      fileStream.on('end', () => {
        tempFiles.forEach(f => { try { unlinkSync(f) } catch {} })
      })
    } else {
      console.error(\`[2MStream] Preview generation failed:\`, stderr.slice(-500))
      tempFiles.forEach(f => { try { unlinkSync(f) } catch {} })
      res.status(500).json({ error: 'Preview generation failed', detail: stderr.slice(-300) })
    }
  })

  proc.on('error', (err) => {
    tempFiles.forEach(f => { try { unlinkSync(f) } catch {} })
    res.status(500).json({ error: 'FFmpeg failed', detail: err.message })
  })
})

app.post('/restart', async (req, res) => {
  const { streamId, overlays } = req.body

  if (!streamId) {
    return res.status(400).json({ error: 'Missing streamId' })
  }

  const existing = activeStreams.get(streamId)
  if (!existing || !existing.config) {
    return res.status(404).json({ error: 'Stream not found or not running' })
  }

  console.log(\`[2MStream] Restarting stream \${streamId} with \${overlays?.length || 0} overlay(s)\`)

  const updatedConfig = { ...existing.config, overlays: overlays || [] }

  stopStream(streamId)

  await new Promise(r => setTimeout(r, 500))

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
    const rtmpTarget = \`\${dest.rtmpUrl}/\${dest.streamKey}\`
    let ffmpegArgs = [...inputArgs]

    if (overlayResult) {
      ffmpegArgs.push(...overlayResult.inputArgs)
      ffmpegArgs.push('-filter_complex', overlayResult.filterComplex)
      ffmpegArgs.push('-map', \`[\${overlayResult.outputLabel}]\`)
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
        console.log(\`[FFmpeg \${streamId}/\${dest.id}] \${msg.trim()}\`)
      }
    })
    proc.on('close', (code) => {
      console.log(\`[2MStream] FFmpeg process for \${streamId}/\${dest.id} exited with code \${code}\`)
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

  console.log(\`[2MStream] Stopping stream \${streamId}\`)
  
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

  if (stream.tempFiles) {
    for (const f of stream.tempFiles) {
      try { unlinkSync(f) } catch {}
    }
  }

  activeStreams.delete(streamId)
  return true
}

process.on('SIGINT', () => {
  console.log('[2MStream] Shutting down, stopping all streams...')
  for (const [streamId] of activeStreams) {
    stopStream(streamId)
  }
  process.exit(0)
})

app.listen(PORT, () => {
  console.log(\`[2MStream] Streaming engine listening on port \${PORT}\`)
  console.log(\`[2MStream] Video directory: \${VIDEO_DIR}\`)
  console.log(\`[2MStream] Supports: playlists, overlays (image + text), multi-destination\`)
  console.log(\`[2MStream] Waiting for stream commands...\`)
})
`
    return new Response(serverCode, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }

  return new Response("Unknown file. Use ?file=streaming-server.js or ?file=package.json", { status: 400 })
}
