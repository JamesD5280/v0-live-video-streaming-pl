/**
 * Bunny CDN Storage utilities
 * Handles file uploads, downloads, and management
 */

const BUNNY_API_KEY = process.env.BUNNY_API_KEY
const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || "2mstreamsn"
const BUNNY_STORAGE_PASSWORD = process.env.BUNNY_STORAGE_PASSWORD
// Map region names to Bunny storage region codes
const regionMap: Record<string, string> = {
  "new york": "ny",
  "newyork": "ny",
  "ny": "ny",
  "los angeles": "la",
  "losangeles": "la",
  "la": "la",
  "singapore": "sg",
  "sg": "sg",
  "sydney": "syd",
  "syd": "syd",
  "johannesburg": "jh",
  "jh": "jh",
  "frankfurt": "de",
  "de": "de",
  "london": "uk",
  "uk": "uk",
  "stockholm": "se",
  "se": "se",
}
const rawRegion = (process.env.BUNNY_STORAGE_REGION || "ny").toLowerCase()
const BUNNY_STORAGE_REGION = regionMap[rawRegion] || "ny"

const BUNNY_API_BASE = "https://api.bunnycdn.com"
const BUNNY_STORAGE_BASE = `https://${BUNNY_STORAGE_REGION}.storage.bunnycdn.com`

export interface BunnyFile {
  name: string
  path: string
  size: number
  dateModified: string
  contentType?: string
  isDirectory: boolean
}

/**
 * Upload file to Bunny Storage
 * Supports direct file upload via HTTP PUT
 */
export async function uploadToBunny(
  filename: string,
  fileBuffer: Buffer,
  directory: string = "videos"
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    if (!BUNNY_API_KEY) {
      throw new Error("BUNNY_API_KEY not configured")
    }

    const fullPath = `${directory}/${filename}`
    const url = `https://api.bunnycdn.com/files/${BUNNY_STORAGE_ZONE}/${fullPath}`

    console.log("[v0] Bunny Upload via API:", {
      url,
      zone: BUNNY_STORAGE_ZONE,
      bufferSize: fileBuffer.length,
    })

    // Use API Key header (more reliable than storage zone password)
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "AccessKey": BUNNY_API_KEY,
        "Content-Type": "application/octet-stream",
      },
      body: fileBuffer,
    })

    console.log("[v0] Bunny API Response:", response.status, response.statusText)

    if (!response.ok) {
      const responseText = await response.text()
      console.error("[v0] Bunny API Error:", {
        status: response.status,
        statusText: response.statusText,
        response: responseText.substring(0, 300),
      })
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`)
    }

    // Return the CDN URL for accessing the file
    const cdnUrl = `https://${BUNNY_STORAGE_ZONE}.b-cdn.net/${directory}/${filename}`
    console.log("[v0] Upload successful:", cdnUrl)
    return { success: true, url: cdnUrl }
  } catch (error) {
    console.error("[Bunny] Upload error:", error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Upload failed" 
    }
  }
}

/**
 * List files in a Bunny Storage directory
 */
export async function listBunnyFiles(directory: string = "videos"): Promise<BunnyFile[]> {
  try {
    if (!BUNNY_STORAGE_PASSWORD) {
      throw new Error("BUNNY_STORAGE_PASSWORD not configured")
    }

    const path = `/${BUNNY_STORAGE_ZONE}/${directory}/`
    const url = `${BUNNY_STORAGE_BASE}${path}`

    const response = await fetch(url, {
      method: "GET",
      headers: {
        AccessKey: BUNNY_STORAGE_PASSWORD,
      },
    })

    if (!response.ok) {
      if (response.status === 404) return []
      throw new Error(`List failed: ${response.status}`)
    }

    const files = (await response.json()) as BunnyFile[]
    return files.filter((f) => !f.isDirectory)
  } catch (error) {
    console.error("[Bunny] List error:", error)
    return []
  }
}

/**
 * Delete file from Bunny Storage
 */
export async function deleteFromBunny(filename: string, directory: string = "videos"): Promise<boolean> {
  try {
    if (!BUNNY_STORAGE_PASSWORD) {
      throw new Error("BUNNY_STORAGE_PASSWORD not configured")
    }

    const path = `/${BUNNY_STORAGE_ZONE}/${directory}/${filename}`
    const url = `${BUNNY_STORAGE_BASE}${path}`

    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        AccessKey: BUNNY_STORAGE_PASSWORD,
      },
    })

    return response.ok
  } catch (error) {
    console.error("[Bunny] Delete error:", error)
    return false
  }
}

/**
 * Get file info from Bunny Storage
 */
export async function getBunnyFileInfo(filename: string, directory: string = "videos") {
  try {
    if (!BUNNY_STORAGE_PASSWORD) {
      throw new Error("BUNNY_STORAGE_PASSWORD not configured")
    }

    const path = `/${BUNNY_STORAGE_ZONE}/${directory}/${filename}`
    const url = `${BUNNY_STORAGE_BASE}${path}`

    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        AccessKey: BUNNY_STORAGE_PASSWORD,
      },
    })

    if (!response.ok) return null

    return {
      size: response.headers.get("content-length"),
      contentType: response.headers.get("content-type"),
      lastModified: response.headers.get("last-modified"),
    }
  } catch (error) {
    console.error("[Bunny] Get file info error:", error)
    return null
  }
}

/**
 * Get Bunny CDN URL for a file
 */
export function getBunnyCDNUrl(filename: string, directory: string = "videos"): string {
  return `https://${BUNNY_STORAGE_ZONE}.b-cdn.net/${directory}/${filename}`
}
