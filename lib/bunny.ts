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
    if (!BUNNY_STORAGE_PASSWORD) {
      throw new Error("BUNNY_STORAGE_PASSWORD not configured")
    }

    const password = BUNNY_STORAGE_PASSWORD.trim()
    const path = `/${BUNNY_STORAGE_ZONE}/${directory}/${filename}`
    const url = `${BUNNY_STORAGE_BASE}${path}`

    console.log("[v0] Bunny Storage Upload - Request Details:", {
      url,
      method: "PUT",
      zone: BUNNY_STORAGE_ZONE,
      region: BUNNY_STORAGE_REGION,
      bufferSize: fileBuffer.length,
      bufferType: fileBuffer.constructor.name,
      headers: {
        AccessKey: `${password.substring(0, 8)}...${password.substring(-8)}`,
        "Content-Type": "application/octet-stream",
      },
    })

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "AccessKey": password,
        "Content-Type": "application/octet-stream",
      },
      body: fileBuffer,
    })

    const responseText = await response.text()
    console.log("[v0] Bunny Storage Response:", {
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get("content-type"),
      body: responseText,
    })

    if (!response.ok) {
      console.error("[v0] Bunny Upload Failed - Details:", {
        status: response.status,
        statusText: response.statusText,
        url,
        responseBody: responseText,
      })
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`)
    }

    const cdnUrl = `https://${BUNNY_STORAGE_ZONE}.b-cdn.net/${directory}/${filename}`
    console.log("[v0] Upload successful:", { cdnUrl, responseBody: responseText })
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
