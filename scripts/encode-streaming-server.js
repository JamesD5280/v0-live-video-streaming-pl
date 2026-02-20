import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const serverFile = join(__dirname, 'streaming-engine', 'streaming-server.js')
const content = readFileSync(serverFile, 'utf-8')
const encoded = Buffer.from(content).toString('base64')

const outputPath = join(__dirname, '..', 'lib', 'streaming-server-b64.ts')
writeFileSync(outputPath, `// Auto-generated: base64-encoded streaming-server.js\n// DO NOT EDIT - regenerate with: node scripts/encode-streaming-server.js\nexport const STREAMING_SERVER_B64 = "${encoded}"\n`)
console.log(`Encoded ${content.length} bytes -> ${encoded.length} base64 chars -> ${outputPath}`)
