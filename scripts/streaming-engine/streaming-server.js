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
import { spawn, execFile } from 'child_process'
import { existsSync, writeFileSync, unlinkSync, mkdirSync, readdirSync, statSync, lstatSync, createWriteStream, createReadStream, rmdirSync, copyFileSync, mkdtempSync, rmSync, openSync, readSync, closeSync } from 'fs'
import { join, basename, dirname, extname } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { createHmac } from 'crypto'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
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

// Active FFmpeg processes: streamId -> { processes, destinations[], tempFiles[], playlistState? }
const activeStreams = new Map()

function isProcessRunning(proc) {
  return Boolean(
    proc &&
      typeof proc.pid === 'number' &&
      proc.exitCode === null &&
      proc.signalCode === null &&
      !proc.killed
  )
}

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
      running: info.processes.some(p => isProcessRunning(p.proc)),
      hasVideoFrames: info.processes.some(p => p.hasProducedFrames),
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
 * Build FFmpeg overlay filter chain for image, video, and text overlays.
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

const ENGINE_DIRECTORY = dirname(fileURLToPath(import.meta.url))
const VIGA_FONT_FILE = join(ENGINE_DIRECTORY, 'fonts', 'Viga-Regular.ttf')

const FONT_FILES = {
  viga: {
    normal: VIGA_FONT_FILE,
    bold: VIGA_FONT_FILE,
    italic: VIGA_FONT_FILE,
    'bold-italic': VIGA_FONT_FILE,
  },
  sans: {
    normal: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    italic: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf',
    'bold-italic': '/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf',
  },
  serif: {
    normal: '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',
    bold: '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
    italic: '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf',
    'bold-italic': '/usr/share/fonts/truetype/dejavu/DejaVuSerif-BoldItalic.ttf',
  },
  mono: {
    normal: '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
    bold: '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf',
    italic: '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Oblique.ttf',
    'bold-italic': '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-BoldOblique.ttf',
  },
  arial: {
    normal: '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf',
    bold: '/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf',
    italic: '/usr/share/fonts/truetype/liberation2/LiberationSans-Italic.ttf',
    'bold-italic': '/usr/share/fonts/truetype/liberation2/LiberationSans-BoldItalic.ttf',
  },
  times: {
    normal: '/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf',
    bold: '/usr/share/fonts/truetype/liberation2/LiberationSerif-Bold.ttf',
    italic: '/usr/share/fonts/truetype/liberation2/LiberationSerif-Italic.ttf',
    'bold-italic': '/usr/share/fonts/truetype/liberation2/LiberationSerif-BoldItalic.ttf',
  },
  courier: {
    normal: '/usr/share/fonts/truetype/liberation2/LiberationMono-Regular.ttf',
    bold: '/usr/share/fonts/truetype/liberation2/LiberationMono-Bold.ttf',
    italic: '/usr/share/fonts/truetype/liberation2/LiberationMono-Italic.ttf',
    'bold-italic': '/usr/share/fonts/truetype/liberation2/LiberationMono-BoldItalic.ttf',
  },
}

function getFontFile(family, weight) {
  const files = Object.hasOwn(FONT_FILES, family) ? FONT_FILES[family] : FONT_FILES.sans
  const face = Object.hasOwn(files, weight) ? weight : 'normal'
  const requestedFont = files[face] || files.normal
  if (requestedFont && existsSync(requestedFont)) return requestedFont

  const fallbackFonts = [files.normal, FONT_FILES.sans[face], FONT_FILES.sans.normal]
  return fallbackFonts.find(fontPath => fontPath && existsSync(fontPath)) || null
}

function getOverlayTimeZone(overlays = []) {
  const clock = overlays.find(overlay => overlay.type === 'clock')
  if (!clock?.textContent) return undefined

  try {
    const settings = JSON.parse(clock.textContent)
    const timeZone = typeof settings.timeZone === 'string' ? settings.timeZone : 'UTC'
    new Intl.DateTimeFormat('en-US', { timeZone }).format()
    return timeZone
  } catch {
    return 'UTC'
  }
}

function spawnFfmpeg(args, timeZone) {
  const options = { stdio: ['pipe', 'pipe', 'pipe'] }
  if (timeZone) options.env = { ...process.env, TZ: timeZone }
  return spawn('ffmpeg', args, options)
}

function recordFfmpegStderr(procEntry, chunk) {
  procEntry.ffmpegStderrTail = `${procEntry.ffmpegStderrTail || ''}${chunk.toString()}`.slice(-4096)
}

function getSafeFfmpegDiagnostic(procEntry) {
  const lines = String(procEntry?.ffmpegStderrTail || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
  const errorLines = lines.filter(line => /error|invalid|failed|not found|no such file|unable|could not|cannot|refused|timed out|forbidden|\b40[134]\b/i.test(line))
  const diagnosticLines = errorLines.length > 0
    ? errorLines
    : lines.filter(line => !/frame=\s*\d+/i.test(line))

  return diagnosticLines
    .map(line => line
      .replace(/(?:https?|rtmps?):\/\/[^\s'"<>]+/gi, '[URL redacted]')
      .replace(/\b((?:token|secret|password|stream[_-]?key)\b\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]')
      .replace(/\b(Bearer\s+)[^\s,;]+/gi, '$1[redacted]'))
    .slice(-8)
    .join('\n')
    .slice(-1200)
}

function formatFfmpegColor(value, opacity = 100, fallback = 'white') {
  let color = typeof value === 'string' ? value.trim() : ''
  let intrinsicAlpha = 1

  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(color)) {
    const hex = color.slice(1)
    color = `0x${hex.slice(0, 6).toUpperCase()}`
    if (hex.length === 8) intrinsicAlpha = parseInt(hex.slice(6), 16) / 255
  } else if (color.toLowerCase() === 'transparent' || color.toLowerCase() === 'none') {
    color = '0x000000'
    intrinsicAlpha = 0
  } else if (/^[a-z]+$/i.test(color)) {
    color = color.toLowerCase()
  } else {
    color = fallback
  }

  const normalizedOpacity = Number.isFinite(Number(opacity))
    ? Math.max(0, Math.min(100, Number(opacity))) / 100
    : 1
  const alpha = Math.max(0, Math.min(1, intrinsicAlpha * normalizedOpacity))
  return `${color}@${alpha.toFixed(3)}`
}

function buildOverlayFilters(overlays) {
  console.log(`[2MStream] buildOverlayFilters called with ${overlays?.length || 0} overlays`)
  if (!overlays || overlays.length === 0) return null

  // Sort overlays for correct layer order (processed last = on top)
  // Keep clock text above media overlays so video layers cannot cover it.
  const sortedOverlays = [...overlays].sort((a, b) => {
    const order = { 'image': 0, 'scrolling_text': 1, 'text': 2, 'video': 3, 'clock': 4 }
    return (order[a.type] ?? 1) - (order[b.type] ?? 1)
  })
  console.log(`[2MStream] Overlay render order: ${sortedOverlays.map(o => o.type).join(' -> ')}`)

  const inputArgs = []
  const filters = []
  let currentLabel = '0:v'
  let inputIndex = 1 // 0 is the main video input

  for (let i = 0; i < sortedOverlays.length; i++) {
    const overlay = sortedOverlays[i]
    console.log(`[2MStream] Overlay ${i}: type=${overlay.type}, posX=${overlay.positionX}, posY=${overlay.positionY}`)
    const outputLabel = `ov${i}`

    // Map position to FFmpeg overlay coordinates
    let posCoords
    if (overlay.positionX !== undefined && overlay.positionY !== undefined) {
      const px = overlay.positionX / 100
      const py = overlay.positionY / 100
      posCoords = `x=max(0\\,min(W-w\\,round(W*${px}-w/2))):y=max(0\\,min(H-h\\,round(H*${py}-h/2)))`
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

    const legacyImagePosMap = {
      'top-left': 'x=W*0.03:y=H*0.04',
      'top-center': 'x=(W-w)/2:y=H*0.04',
      'top-right': 'x=W-w-W*0.03:y=H*0.04',
      'center': 'x=(W-w)/2:y=(H-h)/2',
      'bottom-left': 'x=W*0.03:y=H-h-H*0.04',
      'bottom-center': 'x=(W-w)/2:y=H-h-H*0.04',
      'bottom-right': 'x=W-w-W*0.03:y=H-h-H*0.04',
    }
    const imagePosCoords = overlay.positionX !== undefined && overlay.positionY !== undefined
      ? posCoords
      : legacyImagePosMap[overlay.position] || legacyImagePosMap['top-left']

    if (overlay.type === 'scrolling_text') {
      const escapedText = (overlay.textContent || '').replace(/'/g, "'\\''").replace(/:/g, '\\:')
      const fontSize = Math.max(12, Math.min(120, Number(overlay.fontSize) || 24))
      const fontColor = formatFfmpegColor(overlay.fontColor || 'white', overlay.opacity ?? 100, 'white')
      const bgColorValue = overlay.bgColor || 'black'
      const hasTransparentBackground = ['transparent', 'none'].includes(String(bgColorValue).toLowerCase())
      const bgColor = formatFfmpegColor(bgColorValue, overlay.opacity ?? 100, 'black')
      const speed = Math.max(1, Math.min(500, Number(overlay.scrollSpeed) || 20))
      const fontFile = getFontFile(overlay.fontFamily, overlay.fontWeight)
      const fontParam = fontFile ? `fontfile='${fontFile}'` : "font='Sans'"

      const barHeight = fontSize + 16

      // Position Y is the vertical center, matching the overlay editor.
      let scrollCenterY
      if (overlay.positionY !== undefined && overlay.positionY !== null) {
        scrollCenterY = Math.round(1080 * overlay.positionY / 100)
        scrollCenterY = Math.max(fontSize, Math.min(1080 - fontSize - 10, scrollCenterY))
      } else {
        scrollCenterY = Math.round(1080 * 0.92)
      }
      const scrollTop = Math.round(scrollCenterY - barHeight / 2)
      
      // Keep the ticker clip within the output frame and at least 5% wide.
      const rawStartPercent = Number(overlay.scrollStartX ?? 0)
      const rawEndPercent = Number(overlay.scrollEndX ?? 100)
      const startPercent = Math.max(0, Math.min(95, Number.isFinite(rawStartPercent) ? rawStartPercent : 0))
      const endPercent = Math.max(
        startPercent + 5,
        Math.min(100, Number.isFinite(rawEndPercent) ? rawEndPercent : 100)
      )
      const scrollStartX = Math.round(1920 * startPercent / 100)
      const scrollEndX = Math.round(1920 * endPercent / 100)
      const scrollZoneWidth = Math.max(96, scrollEndX - scrollStartX)
      const estimatedChunkWidth = Math.max(1, (overlay.textContent || '').length * fontSize * 0.55 + fontSize * 3)
      const loopCopyCount = Math.max(3, Math.min(300, Math.ceil((scrollZoneWidth + 100) / estimatedChunkWidth) + 2))
      const loopText = `${escapedText}          `.repeat(loopCopyCount)
      const scrollFormula = `'w-mod(t*${speed}\\,text_w/${loopCopyCount})'`
      
      console.log(`[2MStream] Scrolling text: centerY=${scrollCenterY}px, top=${scrollTop}px, zone X=${scrollStartX}-${scrollEndX}px (width=${scrollZoneWidth}), speed=${speed}, copies=${loopCopyCount}`)
      
      const splitBase = `splitbase${i}`
      const splitText = `splittext${i}`
      const textCropped = `textcrop${i}`
      
      // Split the current video into base and text layer
      filters.push(`[${currentLabel}]split=2[${splitBase}][${splitText}]`)
      
      // The repeated track shifts by one identical text chunk, so the reset frame matches exactly.
      if (hasTransparentBackground) {
        filters.push(
          `[${splitText}]crop=${scrollZoneWidth}:${barHeight}:${scrollStartX}:${scrollTop},drawtext=text='${loopText}':${fontParam}:fontsize=${fontSize}:fontcolor=${fontColor}:y=(h-${fontSize})/2:x=${scrollFormula}[${textCropped}]`
        )
      } else {
        filters.push(
          `[${splitText}]crop=${scrollZoneWidth}:${barHeight}:${scrollStartX}:${scrollTop},drawbox=x=0:y=0:w=iw:h=ih:color=${bgColor}:t=fill,drawtext=text='${loopText}':${fontParam}:fontsize=${fontSize}:fontcolor=${fontColor}:y=(h-${fontSize})/2:x=${scrollFormula}[${textCropped}]`
        )
      }
      
      // Overlay cropped text area back onto base at the zone position
      filters.push(`[${splitBase}][${textCropped}]overlay=x=${scrollStartX}:y=${scrollTop}[${outputLabel}]`)

      currentLabel = outputLabel
    } else if (overlay.type === 'clock') {
      const fontSize = Math.max(12, Math.min(120, Number(overlay.fontSize) || 32))
      const fontColor = formatFfmpegColor(overlay.fontColor || 'white', overlay.opacity ?? 100, 'white')
      const fontFile = getFontFile(overlay.fontFamily, overlay.fontWeight)
      const fontParam = fontFile ? `fontfile='${fontFile}'` : "font='Sans'"
      let textX, textY
      if (overlay.positionX !== undefined && overlay.positionY !== undefined) {
        textX = `w*${overlay.positionX / 100}-tw/2`
        textY = `h*${overlay.positionY / 100}-th/2`
      } else {
        textX = posCoords.split(':')[0].replace('x=', '').replace('W', 'w')
        textY = posCoords.split(':')[1]?.replace('y=', '').replace('H', 'h') || '10'
      }
      const hasTransparentBackground = ['transparent', 'none'].includes(String(overlay.bgColor || '').toLowerCase())
      const clockBox = hasTransparentBackground
        ? ''
        : `:box=1:boxcolor=${formatFfmpegColor(overlay.bgColor || 'black', overlay.opacity ?? 100, 'black')}:boxborderw=8`
      const clockText = '%{localtime\\:%H\\:%M\\:%S %Z}'
      filters.push(
        `[${currentLabel}]drawtext=text='${clockText}':${fontParam}:fontsize=${fontSize}:fontcolor=${fontColor}:x=${textX}:y=${textY}${clockBox}[${outputLabel}]`
      )
      currentLabel = outputLabel
    } else if (overlay.type === 'text' || overlay.type === 'lower_third') {
      const escapedText = (overlay.textContent || '').replace(/'/g, "'\\''").replace(/:/g, '\\:')
      const fontSize = Math.max(12, Math.min(120, Number(overlay.fontSize) || 24))
      const fontColor = formatFfmpegColor(overlay.fontColor || 'white', overlay.opacity ?? 100, 'white')
      const txtFontFile = getFontFile(overlay.fontFamily, overlay.fontWeight)
      const txtFontParam = txtFontFile ? `fontfile='${txtFontFile}'` : "font='Sans'"
      
      if (overlay.type === 'lower_third') {
        const bgColor = formatFfmpegColor(overlay.bgColor || 'black', overlay.opacity ?? 100, 'black')
        let ltY, ltTextY
        if (overlay.positionY !== undefined) {
          ltY = `ih*${overlay.positionY / 100}-${(fontSize + 30) / 2}`
          ltTextY = `h*${overlay.positionY / 100}-${fontSize / 2}`
        } else {
          ltY = `ih-${fontSize + 30}`
          ltTextY = `h-${fontSize + 15}`
        }
        const ltX = '0' // Lower thirds span the frame; only their vertical position is editable.
        filters.push(
          `[${currentLabel}]drawbox=x=${ltX}:y=${ltY}:w=iw:h=${fontSize + 30}:color=${bgColor}:t=fill[bg${i}]`,
          `[bg${i}]drawtext=text='${escapedText}':${txtFontParam}:fontsize=${fontSize}:fontcolor=${fontColor}:x=20:y=${ltTextY}[${outputLabel}]`
        )
      } else {
        let textX, textY
        if (overlay.positionX !== undefined && overlay.positionY !== undefined) {
          textX = `w*${overlay.positionX / 100}-tw/2`
          textY = `h*${overlay.positionY / 100}-th/2`
        } else {
          textX = posCoords.split(':')[0].replace('x=', '').replace('W', 'w').replace('w', 'w')
          textY = posCoords.split(':')[1]?.replace('y=', '').replace('H', 'h') || '10'
        }
        filters.push(
          `[${currentLabel}]drawtext=text='${escapedText}':${txtFontParam}:fontsize=${fontSize}:fontcolor=${fontColor}:x=${textX}:y=${textY}[${outputLabel}]`
        )
      }
      currentLabel = outputLabel
    } else if (overlay.type === 'video' && overlay.videoPath) {
      if (overlay.loopOverlay !== false) {
        inputArgs.push('-stream_loop', '-1')
      }
      inputArgs.push('-i', overlay.videoPath)
      
      const scalePercent = overlay.sizePercent || 20
      const opacityValue = (overlay.opacity || 100) / 100
      // Scale relative to output resolution (1920x1080), not overlay's original size
      const targetWidth = Math.round(1920 * scalePercent / 100)

      const scaleFilter = `[${inputIndex}:v]scale=${targetWidth}:-1,format=rgba,colorchannelmixer=aa=${opacityValue}[vid${i}]`
      filters.push(scaleFilter)
      // Keep the main stream flowing after a non-looping video overlay ends.
      filters.push(`[${currentLabel}][vid${i}]overlay=${imagePosCoords}:eof_action=pass:repeatlast=0[${outputLabel}]`)
      
      currentLabel = outputLabel
      inputIndex++
    } else if (overlay.imagePath) {
      const imageExtension = extname(overlay.imagePath).toLowerCase()
      const usesAnimatedImageDemuxer = ['.gif', '.webp', '.apng'].includes(imageExtension)
      console.log(`[2MStream] Image overlay input: ${imageExtension || '(no extension)'} via ${usesAnimatedImageDemuxer ? 'stream loop' : 'image2 loop'}`)

      if (usesAnimatedImageDemuxer) {
        inputArgs.push('-stream_loop', '-1', '-i', overlay.imagePath)
      } else {
        inputArgs.push('-loop', '1', '-framerate', '30', '-i', overlay.imagePath)
      }
      
      const scalePercent = overlay.sizePercent || 20
      const opacityValue = (overlay.opacity || 100) / 100
      // Scale relative to output resolution (1920x1080), not overlay's original size
      const targetWidth = Math.round(1920 * scalePercent / 100)

      const scaleFilter = `[${inputIndex}:v]scale=${targetWidth}:-1,format=rgba,colorchannelmixer=aa=${opacityValue}[img${i}]`
      filters.push(scaleFilter)
      // Keep the main stream flowing after the overlay input ends.
      filters.push(`[${currentLabel}][img${i}]overlay=${imagePosCoords}:eof_action=pass:repeatlast=0[${outputLabel}]`)
      
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

// Ensure video directory exists
mkdirSync(VIDEO_DIR, { recursive: true })

/**
 * POST /upload
 * Receives a raw video file as the request body via streaming.
 */
app.post('/upload', async (req, res) => {
  const filename = req.headers['x-filename'] || `upload-${Date.now()}.mp4`
  const safeFilename = basename(String(filename))
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
    try { unlinkSync(destPath) } catch {}
    res.status(500).json({ error: `Upload failed: ${err.message}` })
  }
})

// Track ongoing chunked uploads
const chunkedUploads = new Map()

/**
 * POST /upload/chunk
 */
app.post('/upload/chunk', async (req, res) => {
  const filename = req.headers['x-filename'] || `upload-${Date.now()}.mp4`
  const uploadId = req.headers['x-upload-id'] || `default-${Date.now()}`
  const chunkIndex = parseInt(req.headers['x-chunk-index'] || '0', 10)
  const totalChunks = parseInt(req.headers['x-total-chunks'] || '1', 10)
  const safeFilename = basename(String(filename))

  try {
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

    const writeStream = createWriteStream(chunkPath)
    await pipeline(req, writeStream)
    upload.receivedChunks.add(chunkIndex)

    console.log(`[2MStream] Chunk ${chunkIndex + 1}/${totalChunks} received for ${safeFilename}`)

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

app.post('/overlays/png-sequence', async (req, res) => {
  const filename = basename(String(req.body.filename || ''))
  const fps = Number(req.body.fps)
  if (!/^overlay-[a-zA-Z0-9-]+\.zip$/i.test(filename) || !Number.isInteger(fps) || fps < 1 || fps > 60) {
    return res.status(400).json({ error: 'Invalid PNG sequence request' })
  }

  const archivePath = join(VIDEO_DIR, filename)
  if (!existsSync(archivePath)) return res.status(404).json({ error: 'Sequence archive not found' })
  if (statSync(archivePath).size > 512 * 1024 * 1024) {
    return res.status(413).json({ error: 'PNG sequence ZIP exceeds the 512 MB limit' })
  }

  const workDir = mkdtempSync(join(tmpdir(), '2mstream-png-sequence-'))
  try {
    const { stdout: listing } = await execFileAsync('unzip', ['-Z1', archivePath], { maxBuffer: 1024 * 1024 })
    const entries = listing.split(/\r?\n/).filter(Boolean)
    const frameEntries = []
    const seenNames = new Set()

    for (const entry of entries) {
      const normalized = entry.replaceAll('\\', '/')
      const frameName = basename(normalized)
      if (normalized.startsWith('__MACOSX/') || frameName === '.DS_Store' || frameName.startsWith('._')) continue
      if (normalized.startsWith('/') || normalized.split('/').includes('..')) {
        return res.status(400).json({ error: 'ZIP contains an unsafe path' })
      }
      if (normalized.endsWith('/')) continue
      if (!/\.png$/i.test(frameName) || !/\d+/.test(frameName)) {
        return res.status(400).json({ error: 'ZIP must contain only numbered PNG frames' })
      }
      if (seenNames.has(frameName.toLowerCase())) {
        return res.status(400).json({ error: 'ZIP contains duplicate frame names' })
      }
      seenNames.add(frameName.toLowerCase())
      frameEntries.push(normalized)
    }

    if (frameEntries.length < 2 || frameEntries.length > 600) {
      return res.status(400).json({ error: 'PNG sequences must contain between 2 and 600 frames' })
    }

    const { stdout: details } = await execFileAsync('unzip', ['-l', archivePath], { maxBuffer: 2 * 1024 * 1024 })
    const uncompressedBytes = details.split(/\r?\n/).reduce((total, line) => {
      const match = line.match(/^\s*(\d+)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+(.+)$/)
      if (!match) return total
      const entryName = match[2].replaceAll('\\', '/')
      if (!/\.png$/i.test(basename(entryName))) return total
      return total + Number(match[1])
    }, 0)
    if (uncompressedBytes > 1024 * 1024 * 1024) {
      return res.status(413).json({ error: 'Expanded PNG sequence exceeds the 1 GB limit' })
    }

    await execFileAsync('unzip', ['-j', '-q', archivePath, '-d', workDir], { timeout: 120_000 })
    const extractedFrames = readdirSync(workDir)
      .filter((entry) => /\.png$/i.test(entry))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))

    if (extractedFrames.length !== frameEntries.length) {
      return res.status(400).json({ error: 'Could not extract every PNG frame' })
    }

    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    let extractedBytes = 0
    extractedFrames.forEach((frame, index) => {
      const framePath = join(workDir, frame)
      const stats = lstatSync(framePath)
      if (!stats.isFile()) throw new Error('Sequence frames must be regular files')
      extractedBytes += stats.size
      if (extractedBytes > 1024 * 1024 * 1024) throw new Error('Expanded PNG sequence exceeds the 1 GB limit')
      const descriptor = openSync(framePath, 'r')
      const signature = Buffer.alloc(8)
      let bytesRead = 0
      try {
        bytesRead = readSync(descriptor, signature, 0, signature.length, 0)
      } finally {
        closeSync(descriptor)
      }
      if (bytesRead !== signature.length || !signature.equals(pngSignature)) {
        throw new Error('A sequence frame is not a valid PNG')
      }
      const stagedPath = join(workDir, `frame-${String(index).padStart(6, '0')}.png`)
      if (framePath !== stagedPath) copyFileSync(framePath, stagedPath)
    })

    const outputName = filename.replace(/\.zip$/i, '.mov')
    const outputPath = join(VIDEO_DIR, outputName)
    await execFileAsync('ffmpeg', [
      '-framerate', String(fps),
      '-start_number', '0',
      '-i', join(workDir, 'frame-%06d.png'),
      '-an',
      '-c:v', 'qtrle',
      '-pix_fmt', 'argb',
      '-movflags', '+faststart',
      '-y', outputPath,
    ], { timeout: 300_000, maxBuffer: 8 * 1024 * 1024 })

    unlinkSync(archivePath)
    const outputStats = statSync(outputPath)
    res.json({ success: true, filename: outputName, path: outputPath, frames: extractedFrames.length, fps, size: outputStats.size })
  } catch (error) {
    console.error('[2MStream] PNG sequence conversion failed:', error.message)
    res.status(500).json({ error: 'PNG sequence conversion failed' })
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
})

/**
 * GET /videos
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
 */
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

function getVideoContentType(filename) {
  const ext = filename.split('.').pop()?.toLowerCase() || 'mp4'
  const mimeTypes = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    webm: 'video/webm',
    flv: 'video/x-flv',
    ts: 'video/mp2t',
  }
  return mimeTypes[ext] || 'video/mp4'
}

/** HEAD /stream-video/:filename -- return metadata without reading the video file. */
app.head('/stream-video/:filename', (req, res) => {
  const { token, expires } = req.query
  const bearerAuth = req.headers.authorization

  if (token && expires) {
    const filename = basename(req.params.filename)
    const payload = `${filename}:${expires}`
    const expected = createHmac('sha256', API_SECRET).update(payload).digest('hex')
    if (token !== expected || Date.now() > parseInt(expires, 10)) {
      return res.status(403).end()
    }
  } else if (!bearerAuth || bearerAuth !== `Bearer ${API_SECRET}`) {
    return res.status(401).end()
  }

  const safeFilename = basename(req.params.filename)
  const filePath = join(VIDEO_DIR, safeFilename)
  if (!existsSync(filePath)) return res.status(404).end()

  const fileSize = statSync(filePath).size
  res.writeHead(200, {
    'Content-Length': fileSize,
    'Content-Type': getVideoContentType(safeFilename),
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
  }).end()
})

/**
 * GET /stream-video/:filename
 */
app.get('/stream-video/:filename', (req, res) => {
  const { token, expires } = req.query
  const bearerAuth = req.headers.authorization
  
  if (token && expires) {
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

  const contentType = getVideoContentType(safeFilename)

  const range = req.headers.range
  if (range) {
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
 * Build FFmpeg args for a single file with overlays and encoding.
 * Returns the full ffmpegArgs array.
 */
const VIDEO_NORM_FILTER = 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1'

function buildFFmpegArgs(inputArgs, overlayResult, rtmpTarget) {
  const ffmpegArgs = [...inputArgs]

  if (overlayResult) {
    ffmpegArgs.push(...overlayResult.inputArgs)
    const overlayChain = overlayResult.filterComplex.replace('[0:v]', '[norm]')
    const combinedFilter = `[0:v]${VIDEO_NORM_FILTER}[norm];${overlayChain}`
    ffmpegArgs.push('-filter_complex', combinedFilter)
    ffmpegArgs.push('-map', `[${overlayResult.outputLabel}]`)
    ffmpegArgs.push('-map', '0:a?')  // Optional audio - use if exists
  } else {
    ffmpegArgs.push('-vf', VIDEO_NORM_FILTER)
  }

  ffmpegArgs.push(
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-r', '30',              // Force 30fps output - prevents runaway encoding
    '-vsync', 'cfr',         // Constant frame rate - ensures steady output
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

  return ffmpegArgs
}


/**
 * Sequential playlist player.
 * Plays one file at a time. When a file finishes (exit code 0), starts the next.
 * Each file gets a clean FFmpeg process -- no concat demuxer, no H264 boundary errors.
 */
function startPlaylistForDest(streamId, dest, videoSources, overlayResult, loop, tempFiles, resumePosition = null, timeZone) {
  const rtmpTarget = `${dest.rtmpUrl}/${dest.streamKey}`
  // Resume from saved position if available
  let currentIndex = resumePosition?.fileIndex || 0
  let currentSeekTime = resumePosition?.seekTime || 0
  let stopped = false
  let currentProc = null
  let restartCount = 0
  let playbackStartTime = null  // Track when current file started playing
  
  if (resumePosition) {
    console.log(`[2MStream] Resuming from file ${currentIndex + 1}, position ${currentSeekTime}s`)
  }

  function playCurrentFile() {
    if (stopped) return

    const streamEntry = activeStreams.get(streamId)
    if (!streamEntry || streamEntry.stopping) {
      // Retry -- the stream may not be registered yet
      setTimeout(() => {
        const retry = activeStreams.get(streamId)
        if (retry && !retry.stopping) {
          playCurrentFile()
        }
      }, 500)
      return
    }

    const source = videoSources[currentIndex]
    const filePath = source.url || join(VIDEO_DIR, source.path || '')

    // Check file exists for local files
    if (!source.url && !existsSync(filePath)) {
      console.error(`[2MStream] File not found, skipping: ${filePath}`)
      advanceToNext()
      return
    }

    // Build input args with seek position if resuming
    const inputArgs = []
    if (currentSeekTime > 0) {
      inputArgs.push('-ss', String(Math.floor(currentSeekTime)))
      console.log(`[2MStream] Seeking to ${Math.floor(currentSeekTime)}s`)
    }
    inputArgs.push('-re', '-i', filePath)
    const ffmpegArgs = buildFFmpegArgs(inputArgs, overlayResult, rtmpTarget)
    
    // Track playback start time for position calculation
    playbackStartTime = Date.now()

    console.log(`[2MStream] Playing file ${currentIndex + 1}/${videoSources.length}: ${source.title || source.path || source.url}${currentSeekTime > 0 ? ` (from ${Math.floor(currentSeekTime)}s)` : ''}`)

    const proc = spawnFfmpeg(ffmpegArgs, timeZone)
    currentProc = proc

    // Update the procEntry in activeStreams so status checks work
    const entry = activeStreams.get(streamId)
    if (entry) {
      const pe = entry.processes.find(p => p.destId === dest.id)
      if (pe) {
        pe.proc = proc
        pe.killed = false
        pe.hasProducedFrames = false
        pe.ffmpegStderrTail = ''
        pe.spawnError = undefined
      }
    }

    let fileFinishedNaturally = false
    proc.stderr.on('data', (data) => {
      const msg = data.toString()
      const currentEntry = activeStreams.get(streamId)
      const trackedProcess = currentEntry?.processes.find(p => p.destId === dest.id)
      if (trackedProcess) recordFfmpegStderr(trackedProcess, data)
      if (trackedProcess && /\bframe=\s*\d+/.test(msg)) trackedProcess.hasProducedFrames = true
      if (msg.includes('Error') || msg.includes('error') || msg.includes('No such file') || msg.includes('Invalid')) {
        console.log(`[FFmpeg ${streamId}/${dest.id}] ${msg.trim()}`)
      }
      // Detect when file has finished playing (frame count output at end)
      // FFmpeg outputs "frame=XXXX fps=XX ... time=XX:XX:XX" lines, and at the end outputs total stats
      if (msg.includes('video:') && msg.includes('audio:') && msg.includes('global headers:')) {
        console.log(`[2MStream] Detected file finished (final stats output)`)
        fileFinishedNaturally = true
      }
    })

    proc.on('error', (err) => {
      const currentEntry = activeStreams.get(streamId)
      const trackedProcess = currentEntry?.processes.find(p => p.destId === dest.id)
      if (trackedProcess) trackedProcess.spawnError = err.message
      console.error(`[2MStream] FFmpeg spawn error: ${err.message}`)
    })

    proc.on('close', (code) => {
      console.log(`[2MStream] FFmpeg close event: code=${code}, stopped=${stopped}`)
      if (stopped) {
        console.log(`[2MStream] Stopped flag is true, not restarting`)
        return
      }
      const entry = activeStreams.get(streamId)
      if (!entry || entry.stopping) {
        console.log(`[2MStream] Stream entry not found or stopping, not restarting. entry=${!!entry}, stopping=${entry?.stopping}`)
        return
      }

      if (code === 0 || fileFinishedNaturally) {
        // File finished (code 0 OR detected final stats output)
        // Note: code can be 1 even when file finishes due to RTMP trailer write error
        console.log(`[2MStream] File finished (code=${code}, detected=${fileFinishedNaturally}), advancing to next in 2s`)
        restartCount = 0
        setTimeout(advanceToNext, 2000)
      } else {
        const failedProcess = entry.processes.find(p => p.destId === dest.id)
        const diagnostic = getSafeFfmpegDiagnostic(failedProcess)
        if (diagnostic) console.error(`[FFmpeg ${streamId}/${dest.id}] stderr:\n${diagnostic}`)

        // FFmpeg crashed early -- retry same file, skip after 10 failures
        restartCount++
        if (restartCount > 10) {
          console.error(`[2MStream] ${streamId}/${dest.id} file failed 10 times, skipping to next`)
          restartCount = 0
          setTimeout(advanceToNext, 2000)
          return
        }
        const delay = Math.min(2000 * restartCount, 10000)
        console.log(`[2MStream] FFmpeg crashed early (code ${code}), retrying in ${delay/1000}s (attempt ${restartCount})`)
        setTimeout(playCurrentFile, delay)
      }
    })
  }

  function advanceToNext() {
    currentIndex++
    currentSeekTime = 0  // Reset seek time for new file
    playbackStartTime = null
    if (currentIndex >= videoSources.length) {
      if (loop) {
        currentIndex = 0
        console.log(`[2MStream] Playlist loop: restarting from beginning`)
      } else {
        console.log(`[2MStream] Playlist finished (no loop)`)
        return
      }
    }
    playCurrentFile()
  }

  function stop() {
    stopped = true
    if (currentProc && !currentProc.killed) {
      currentProc.kill('SIGTERM')
      setTimeout(() => {
        try { if (!currentProc.killed) currentProc.kill('SIGKILL') } catch {}
      }, 3000)
    }
  }

  function getPosition() {
    // Calculate current position: seek time + elapsed time since playback started
    if (playbackStartTime) {
      const elapsedSeconds = (Date.now() - playbackStartTime) / 1000
      return {
        fileIndex: currentIndex,
        seekTime: currentSeekTime + elapsedSeconds
      }
    }
    return { fileIndex: currentIndex, seekTime: currentSeekTime }
  }

  // Start playing the first file (delay to allow activeStreams.set() to complete first)
  setTimeout(playCurrentFile, 100)

  return { stop, getCurrentIndex: () => currentIndex, getPosition }
}


/**
 * POST /start
 * Body: {
 *   streamId: "uuid",
 *   videoSources: [{ url?, path?, title? }],
 *   videoUrl: "https://...",
 *   videoPath: "local-file.mp4",
 *   destinations: [{ id, name, rtmpUrl, streamKey }],
 *   overlays: [...],
 *   loop: true/false,
 *   isPlaylist: true/false,
 *   isRtmpPull: true/false,
 *   rtmpPullUrl: "rtmp://..."
 * }
 */
app.post('/start', async (req, res) => {
  console.log('[2MStream] >>> /start endpoint hit <<<')
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

  console.log('[2MStream] Parsed body:', JSON.stringify({ streamId, overlaysCount: overlays?.length, isPlaylist }))

  if (!streamId || !destinations || destinations.length === 0) {
    return res.status(400).json({ error: 'Missing streamId or destinations' })
  }

  console.log(`[2MStream] /start called: streamId=${streamId}, overlays=${overlays?.length || 0}, isPlaylist=${isPlaylist}`)

  // Stop existing stream if running
  if (activeStreams.has(streamId)) {
    stopStream(streamId)
  }

  const tempFiles = []

  // Download remote overlay images to local temp files for FFmpeg
  if (overlays && overlays.length > 0) {
    console.log(`[2MStream] Processing ${overlays.length} overlay(s)...`)
    for (const overlay of overlays) {
      console.log(`[2MStream] Overlay ${overlay.id}: type=${overlay.type}, imagePath=${overlay.imagePath ? overlay.imagePath.slice(0, 80) : 'none'}, videoPath=${overlay.videoPath ? overlay.videoPath.slice(0, 80) : 'none'}`)
      try {
        if (overlay.imagePath && overlay.imagePath.startsWith('http')) {
          const localPath = await downloadToTemp(overlay.imagePath)
          tempFiles.push(localPath)
          overlay.imagePath = localPath
        }
        if (overlay.videoPath && overlay.videoPath.startsWith('http')) {
          const localPath = await downloadToTemp(overlay.videoPath)
          tempFiles.push(localPath)
          overlay.videoPath = localPath
        }
      } catch (dlErr) {
        console.error(`[2MStream] Overlay download failed for ${overlay.id}:`, dlErr.message)
        overlay.imagePath = null
        overlay.videoPath = null
      }
    }
  }

  // Build overlay filters
  const timeZone = getOverlayTimeZone(overlays || [])
  const overlayResult = buildOverlayFilters(overlays)

  const processes = []
  const errors = []
  const playlistControllers = []

  // Determine if this is a playlist with multiple files
  const isMultiFilePlaylist = isPlaylist && videoSources && videoSources.length >= 1

  for (const dest of destinations) {
    const rtmpTarget = `${dest.rtmpUrl}/${dest.streamKey}`

    if (isMultiFilePlaylist) {
      // SEQUENTIAL PLAYLIST MODE: play one file at a time
      // Each file gets a clean FFmpeg process. No concat demuxer. No H264 boundary errors.
      console.log(`[2MStream] Starting sequential playlist for ${streamId} -> ${dest.name || rtmpTarget}`)
      console.log(`[2MStream]   ${videoSources.length} videos, loop=${loop}`)

      // Create a dummy proc entry for status tracking (will be updated by playlist controller)
      const dummyProc = { killed: false, kill: () => {}, pid: null }
      const procEntry = { proc: dummyProc, destId: dest.id, killed: false, restartCount: 0 }
      processes.push(procEntry)

      const controller = startPlaylistForDest(streamId, dest, videoSources, overlayResult, loop, tempFiles, null, timeZone)
      playlistControllers.push(controller)

    } else if (isRtmpPull && rtmpPullUrl) {
      // RTMP PULL MODE
      console.log(`[2MStream] Starting RTMP pull for ${streamId} -> ${dest.name || rtmpTarget}`)
      console.log(`[2MStream]   RTMP pull from: ${rtmpPullUrl}`)

      const inputArgs = ['-rw_timeout', '10000000', '-i', rtmpPullUrl]
      const ffmpegArgs = buildFFmpegArgs(inputArgs, overlayResult, rtmpTarget)

      const proc = spawnFfmpeg(ffmpegArgs, timeZone)
      const procEntry = { proc, destId: dest.id, killed: false, restartCount: 0, hasProducedFrames: false }
      proc.stderr.on('data', (data) => {
        const msg = data.toString()
        recordFfmpegStderr(procEntry, data)
        if (/\bframe=\s*\d+/.test(msg)) procEntry.hasProducedFrames = true
        if (msg.includes('Error') || msg.includes('error') || msg.includes('Opening')) {
          console.log(`[FFmpeg ${streamId}/${dest.id}] ${msg.trim()}`)
        }
      })

      // Auto-restart for RTMP pull (source may disconnect temporarily)
      setupAutoRestart(streamId, dest.id, ffmpegArgs, procEntry, timeZone)
      proc.on('error', (err) => {
        console.error(`[2MStream] FFmpeg spawn error: ${err.message}`)
        errors.push({ destinationId: dest.id, error: err.message })
      })
      processes.push(procEntry)

    } else {
      // SINGLE VIDEO MODE
      const source = videoSources?.[0]
      const inputSource = source?.url || videoUrl || join(VIDEO_DIR, source?.path || videoPath || '')

      if (!source?.url && !videoUrl) {
        const localPath = join(VIDEO_DIR, source?.path || videoPath || '')
        if (!existsSync(localPath)) {
          errors.push({ destinationId: dest.id, error: `Video not found: ${localPath}` })
          continue
        }
      }

      console.log(`[2MStream] Starting single video for ${streamId} -> ${dest.name || rtmpTarget}`)

      if (loop) {
        // For single video loop, use sequential playlist with 1 video
        const dummyProc = { killed: false, kill: () => {}, pid: null }
        const procEntry = { proc: dummyProc, destId: dest.id, killed: false, restartCount: 0 }
        processes.push(procEntry)

        const singleSource = [source || { url: videoUrl, path: videoPath }]
        const controller = startPlaylistForDest(streamId, dest, singleSource, overlayResult, true, tempFiles, null, timeZone)
        playlistControllers.push(controller)
      } else {
        const inputArgs = ['-re', '-i', inputSource]
        const ffmpegArgs = buildFFmpegArgs(inputArgs, overlayResult, rtmpTarget)

        const proc = spawnFfmpeg(ffmpegArgs, timeZone)
        const procEntry = { proc, destId: dest.id, killed: false, restartCount: 0, hasProducedFrames: false }
        proc.stderr.on('data', (data) => {
          const msg = data.toString()
          recordFfmpegStderr(procEntry, data)
          if (/\bframe=\s*\d+/.test(msg)) procEntry.hasProducedFrames = true
          if (msg.includes('Error') || msg.includes('error')) {
            console.log(`[FFmpeg ${streamId}/${dest.id}] ${msg.trim()}`)
          }
        })
        proc.on('error', (err) => {
          procEntry.spawnError = err.message
          errors.push({ destinationId: dest.id, error: err.message })
        })
        processes.push(procEntry)
      }
    }
  }

  activeStreams.set(streamId, { 
    processes, 
    destinations, 
    tempFiles,
    isPlaylist,
    isRtmpPull,
    overlayCount: overlays?.length || 0,
    playlistControllers,
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

  await new Promise(resolve => setTimeout(resolve, 1500))

  const startedStream = activeStreams.get(streamId)
  const activeProcesses = startedStream?.processes.filter(p => isProcessRunning(p.proc)) || []
  const producedFrames = startedStream?.processes.some(p => p.hasProducedFrames) || false
  console.log(`[2MStream] Stream ${streamId}: ${activeProcesses.length}/${startedStream?.processes.length || 0} FFmpeg processes running`)

  if (activeProcesses.length === 0 && !producedFrames) {
    const processErrors = startedStream?.processes.map(p => ({
      destinationId: p.destId,
      error: p.spawnError
        ? `FFmpeg failed to start: ${p.spawnError}`
        : p.proc?.exitCode !== null && p.proc?.exitCode !== undefined
          ? `FFmpeg exited with code ${p.proc.exitCode}`
          : p.proc?.signalCode
            ? `FFmpeg stopped by ${p.proc.signalCode}`
            : 'FFmpeg did not start',
      exitCode: p.proc?.exitCode ?? null,
      signal: p.proc?.signalCode ?? null,
      diagnostic: getSafeFfmpegDiagnostic(p) || undefined,
    })) || []
    stopStream(streamId)
    return res.status(502).json({
      success: false,
      error: 'FFmpeg exited before the stream could start. Check the source video and overlay media.',
      errors: [...errors, ...processErrors],
    })
  }

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
 * Auto-restart for non-playlist streams (RTMP pull, single video no-loop).
 * For playlists, the sequential player handles its own restarts.
 */
function setupAutoRestart(streamId, destId, ffmpegArgs, procEntry, timeZone) {
  procEntry.proc.on('close', (code) => {
    console.log(`[2MStream] FFmpeg for ${streamId}/${destId} exited code=${code}`)
    const streamEntry = activeStreams.get(streamId)
    if (!streamEntry || streamEntry.stopping || procEntry.killed) return
    procEntry.restartCount = (procEntry.restartCount || 0) + 1
    if (procEntry.restartCount > 100) {
      console.error(`[2MStream] ${streamId}/${destId} exceeded 100 restarts, giving up`)
      return
    }
    const delay = Math.min(3000 * procEntry.restartCount, 15000)
    console.log(`[2MStream] Auto-restarting ${streamId}/${destId} in ${delay/1000}s (attempt ${procEntry.restartCount})`)
    setTimeout(() => {
      const current = activeStreams.get(streamId)
      if (!current || current.stopping) return
      try {
        const newProc = spawnFfmpeg(ffmpegArgs, timeZone)
        newProc.stderr.on('data', (d) => {
          const m = d.toString()
          if (m.includes('Error') || m.includes('error')) console.log(`[FFmpeg ${streamId}/${destId}] ${m.trim()}`)
        })
        newProc.on('error', (err) => console.error(`[2MStream] FFmpeg spawn error: ${err.message}`))
        procEntry.proc = newProc
        procEntry.killed = false
        setupAutoRestart(streamId, destId, ffmpegArgs, procEntry, timeZone)
      } catch (e) {
        console.error(`[2MStream] Restart failed: ${e.message}`)
      }
    }, delay)
  })
}


/**
 * POST /stop
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
    running: isProcessRunning(p.proc),
    hasVideoFrames: Boolean(p.hasProducedFrames),
    exitCode: p.proc?.exitCode ?? null,
    signal: p.proc?.signalCode ?? null,
    pid: p.proc?.pid ?? null,
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
 */
app.post('/preview', async (req, res) => {
  const { videoSource, videoSources, overlays, isPlaylist } = req.body

  const previewId = `preview-${Date.now()}`
  const outputFile = join(tmpdir(), `${previewId}.mp4`)
  const tempFiles = [outputFile]

  let inputArgs = []
  if (isPlaylist && videoSources?.length > 1) {
    // For preview, just use the first video
    const source = videoSources[0]
    const inputSource = source.url || join(VIDEO_DIR, source.path || '')
    inputArgs = ['-i', inputSource]
  } else {
    const source = videoSources?.[0] || {}
    const inputSource = source.url || videoSource || join(VIDEO_DIR, source.path || '')
    if (inputSource.startsWith('rtmp://') || inputSource.startsWith('rtmps://')) {
      inputArgs = ['-rw_timeout', '10000000', '-i', inputSource]
    } else {
      inputArgs = ['-i', inputSource]
    }
  }

  const timeZone = getOverlayTimeZone(overlays || [])
  const overlayResult = buildOverlayFilters(overlays || [])

  let ffmpegArgs = [...inputArgs]
  if (overlayResult) {
    ffmpegArgs.push(...overlayResult.inputArgs)
    const overlayChain = overlayResult.filterComplex.replace('[0:v]', '[norm]')
    const combinedFilter = `[0:v]${VIDEO_NORM_FILTER}[norm];${overlayChain}`
    ffmpegArgs.push('-filter_complex', combinedFilter)
    ffmpegArgs.push('-map', `[${overlayResult.outputLabel}]`)
    ffmpegArgs.push('-map', '0:a?')
  } else {
    ffmpegArgs.push('-vf', VIDEO_NORM_FILTER)
  }

  ffmpegArgs.push(
    '-t', '5',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    '-y', outputFile,
  )

  console.log(`[2MStream] Generating preview ${previewId}`)

  const proc = spawnFfmpeg(ffmpegArgs, timeZone)
  let stderr = ''
  proc.stderr.on('data', (data) => { stderr += data.toString() })

  proc.on('close', (code) => {
    if (code === 0 && existsSync(outputFile)) {
      res.setHeader('Content-Type', 'video/mp4')
      res.setHeader('Content-Disposition', `inline; filename="${previewId}.mp4"`)
      const stat = statSync(outputFile)
      res.setHeader('Content-Length', stat.size)

      const stream = createReadStream(outputFile)
      stream.pipe(res)
      stream.on('end', () => {
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

  // Save current playback position before stopping
  let resumePosition = null
  if (existing.playlistControllers && existing.playlistControllers.length > 0) {
    const controller = existing.playlistControllers[0]
    if (controller.getPosition) {
      resumePosition = controller.getPosition()
      console.log(`[2MStream] Saving position: file ${resumePosition.fileIndex + 1}, time ${Math.floor(resumePosition.seekTime)}s`)
    }
  }

  // Build updated config with new overlays
  const updatedConfig = { ...existing.config, overlays: overlays || [] }

  // Stop existing FFmpeg processes
  stopStream(streamId)

  // Brief delay to let FFmpeg fully stop
  await new Promise(r => setTimeout(r, 500))

  // Download overlay images if needed
  const tempFiles = []
  if (updatedConfig.overlays && updatedConfig.overlays.length > 0) {
    for (const overlay of updatedConfig.overlays) {
      try {
        if (overlay.imagePath && overlay.imagePath.startsWith('http')) {
          const localPath = await downloadToTemp(overlay.imagePath)
          tempFiles.push(localPath)
          overlay.imagePath = localPath
        }
        if (overlay.videoPath && overlay.videoPath.startsWith('http')) {
          const localPath = await downloadToTemp(overlay.videoPath)
          tempFiles.push(localPath)
          overlay.videoPath = localPath
        }
      } catch (dlErr) {
        console.error(`[2MStream] Overlay download failed:`, dlErr.message)
        overlay.imagePath = null
        overlay.videoPath = null
      }
    }
  }

  const timeZone = getOverlayTimeZone(updatedConfig.overlays || [])
  const overlayResult = buildOverlayFilters(updatedConfig.overlays)
  const processes = []
  const playlistControllers = []

  const isMultiFilePlaylist = updatedConfig.isPlaylist && updatedConfig.videoSources?.length >= 1

  for (const dest of updatedConfig.destinations) {
    const rtmpTarget = `${dest.rtmpUrl}/${dest.streamKey}`

    if (isMultiFilePlaylist || (updatedConfig.loop && !updatedConfig.isRtmpPull)) {
      // Sequential playlist mode (includes single video loop)
      const sources = isMultiFilePlaylist ? updatedConfig.videoSources : [updatedConfig.videoSources?.[0] || { url: updatedConfig.videoUrl, path: updatedConfig.videoPath }]
      
      const dummyProc = { killed: false, kill: () => {}, pid: null }
      const procEntry = { proc: dummyProc, destId: dest.id, killed: false, restartCount: 0 }
      processes.push(procEntry)

      const controller = startPlaylistForDest(streamId, dest, sources, overlayResult, updatedConfig.loop, tempFiles, resumePosition, timeZone)
      playlistControllers.push(controller)

    } else if (updatedConfig.isRtmpPull && updatedConfig.rtmpPullUrl) {
      const inputArgs = ['-rw_timeout', '10000000', '-i', updatedConfig.rtmpPullUrl]
      const ffmpegArgs = buildFFmpegArgs(inputArgs, overlayResult, rtmpTarget)

      const proc = spawnFfmpeg(ffmpegArgs, timeZone)
      proc.stderr.on('data', (data) => {
        const msg = data.toString()
        if (msg.includes('Error') || msg.includes('error')) console.log(`[FFmpeg ${streamId}/${dest.id}] ${msg.trim()}`)
      })

      const procEntry = { proc, destId: dest.id, killed: false, restartCount: 0 }
      setupAutoRestart(streamId, dest.id, ffmpegArgs, procEntry, timeZone)
      processes.push(procEntry)

    } else {
      const source = updatedConfig.videoSources?.[0]
      const inputSource = source?.url || updatedConfig.videoUrl || join(VIDEO_DIR, source?.path || updatedConfig.videoPath || '')
      const inputArgs = ['-re', '-i', inputSource]
      const ffmpegArgs = buildFFmpegArgs(inputArgs, overlayResult, rtmpTarget)

      const proc = spawnFfmpeg(ffmpegArgs, timeZone)
      proc.stderr.on('data', (data) => {
        const msg = data.toString()
        if (msg.includes('Error') || msg.includes('error')) console.log(`[FFmpeg ${streamId}/${dest.id}] ${msg.trim()}`)
      })
      processes.push({ proc, destId: dest.id, killed: false, restartCount: 0 })
    }
  }

  activeStreams.set(streamId, {
    processes,
    destinations: updatedConfig.destinations,
    tempFiles,
    isPlaylist: updatedConfig.isPlaylist,
    isRtmpPull: updatedConfig.isRtmpPull,
    overlayCount: updatedConfig.overlays?.length || 0,
    playlistControllers,
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
  
  // Mark as stopping so auto-restart / playlist controller don't trigger
  stream.stopping = true
  console.log(`[2MStream] Stopping stream ${streamId}`)
  
  // Stop playlist controllers
  if (stream.playlistControllers) {
    for (const controller of stream.playlistControllers) {
      controller.stop()
    }
  }

  // Kill any remaining FFmpeg processes
  for (const p of stream.processes) {
    if (p.proc && !p.proc.killed) {
      try { p.proc.kill('SIGTERM') } catch {}
      setTimeout(() => {
        try { if (p.proc && !p.proc.killed) p.proc.kill('SIGKILL') } catch {}
      }, 3000)
    }
    p.killed = true
  }

  // Clean up temp files
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
  console.log(`[2MStream] Supports: playlists, overlays (image/video/text/clock/scrolling text; GIF/WebP/APNG), multi-destination`)
  console.log(`[2MStream] Waiting for stream commands...`)
})
