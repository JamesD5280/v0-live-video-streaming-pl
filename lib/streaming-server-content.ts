// Auto-generated: streaming-server.js and package.json content for download endpoint
// This avoids filesystem reads at runtime on Vercel serverless

export const PACKAGE_JSON = JSON.stringify({
  "name": "2mstream-engine",
  "version": "1.0.0",
  "type": "module",
  "scripts": { "start": "node streaming-server.js" },
  "dependencies": { "express": "^4.21.0", "cors": "^2.8.5" }
}, null, 2)

export const STREAMING_SERVER_JS = `/**
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
  // Skip auth for health check and stream-video (has its own auth)
  if (req.path === '/health' || req.path.startsWith('/stream-video')) return next()
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
    const outputLabel = \\\`ov\\\${i}\\\`

    // Map position to FFmpeg overlay coordinates
    let posCoords
    if (overlay.positionX !== undefined && overlay.positionY !== undefined) {
      const px = overlay.positionX / 100
      const py = overlay.positionY / 100
      posCoords = \\\`x=max(0\\\\\\\\,min(W-w\\\\\\\\,W*\\\${px}-w/2)):y=max(0\\\\\\\\,min(H-h\\\\\\\\,H*\\\${py}-h/2))\\\`
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
`
