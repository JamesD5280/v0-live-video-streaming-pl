import { readFileSync, writeFileSync, readdirSync } from 'fs'

// Find the project root
const candidates = [
  '/vercel/share/v0-project/scripts/streaming-engine/streaming-server.js',
  './scripts/streaming-engine/streaming-server.js',
  '../scripts/streaming-engine/streaming-server.js',
  '/home/user/scripts/streaming-engine/streaming-server.js',
]

console.log('CWD:', process.cwd())
try { console.log('CWD contents:', readdirSync(process.cwd()).join(', ')) } catch(e) { console.log('Cannot read CWD') }
try { console.log('/home/user contents:', readdirSync('/home/user').join(', ')) } catch(e) { console.log('Cannot read /home/user') }

let content = null
for (const p of candidates) {
  try {
    content = readFileSync(p, 'utf-8')
    console.log(`Found file at: ${p} (${content.length} bytes)`)
    break
  } catch { console.log(`Not at: ${p}`) }
}

if (!content) {
  console.error('Could not find streaming-server.js')
  process.exit(1)
}

const encoded = Buffer.from(content).toString('base64')
const output = `// Auto-generated\nexport const STREAMING_SERVER_B64 = "${encoded}"\n`
writeFileSync('/home/user/streaming-server-b64.ts', output)
console.log(`Encoded ${content.length} bytes -> ${encoded.length} base64 chars`)
