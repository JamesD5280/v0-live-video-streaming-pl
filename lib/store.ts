// Database types matching the Supabase schema
export type VideoStatus = "ready" | "uploading" | "processing" | "error"
export type StreamStatus = "pending" | "live" | "completed" | "error" | "stopped"
export type Platform = "youtube" | "facebook" | "twitch" | "custom"
export type RepeatMode = "none" | "daily" | "weekly" | "monthly"
export type EventStatus = "scheduled" | "running" | "completed" | "cancelled"
export type OverlayType = "logo" | "bug" | "lower_third" | "text" | "image"
export type OverlayPosition = "top-left" | "top-right" | "top-center" | "bottom-left" | "bottom-right" | "bottom-center" | "center"

export interface Video {
  id: string
  user_id: string
  title: string
  filename: string
  file_size: number
  duration_seconds: number | null
  resolution: string | null
  format: string | null
  storage_path: string | null
  thumbnail_path: string | null
  status: VideoStatus
  created_at: string
  updated_at: string
}

export interface Destination {
  id: string
  user_id: string
  platform: Platform
  name: string
  rtmp_url: string
  stream_key: string
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface Stream {
  id: string
  user_id: string
  video_id: string | null
  playlist_id: string | null
  title: string
  status: StreamStatus
  started_at: string | null
  ended_at: string | null
  viewer_count: number
  created_at: string
  updated_at: string
  // Joined fields
  video?: Video
  playlist?: Playlist
  stream_destinations?: StreamDestination[]
  stream_overlays?: StreamOverlay[]
}

export interface StreamDestination {
  id: string
  stream_id: string
  destination_id: string
  status: string
  created_at: string
  destination?: Destination
}

export interface ScheduledEvent {
  id: string
  user_id: string
  video_id: string
  title: string
  scheduled_at: string
  repeat_mode: RepeatMode
  status: EventStatus
  created_at: string
  updated_at: string
  video?: Video
  event_destinations?: EventDestination[]
}

export interface EventDestination {
  id: string
  event_id: string
  destination_id: string
  created_at: string
  destination?: Destination
}

export interface Playlist {
  id: string
  user_id: string
  name: string
  description: string | null
  loop: boolean
  created_at: string
  updated_at: string
  playlist_items?: PlaylistItem[]
}

export interface PlaylistItem {
  id: string
  playlist_id: string
  video_id: string
  position: number
  created_at: string
  video?: Video
}

export interface Overlay {
  id: string
  user_id: string
  name: string
  type: OverlayType
  image_path: string | null
  text_content: string | null
  font_size: number
  font_color: string
  bg_color: string
  position: OverlayPosition
  size_percent: number
  opacity: number
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface StreamOverlay {
  id: string
  stream_id: string
  overlay_id: string
  created_at: string
  overlay?: Overlay
}

export interface UserSettings {
  id: string
  default_resolution: string
  default_bitrate: string
  default_framerate: string
  default_audio_bitrate: string
  notify_stream_start: boolean
  notify_stream_end: boolean
  notify_stream_error: boolean
  notify_schedule_reminder: boolean
  webhook_url: string | null
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  display_name: string | null
  email: string | null
  created_at: string
  updated_at: string
}

// Platform helpers
export const platformLabels: Record<Platform, string> = {
  youtube: "YouTube",
  twitch: "Twitch",
  facebook: "Facebook",
  custom: "Custom RTMP",
}

export const platformRtmpUrls: Record<string, string> = {
  youtube: "rtmp://a.rtmp.youtube.com/live2",
  twitch: "rtmp://live.twitch.tv/app",
  facebook: "rtmps://live-api-s.facebook.com:443/rtmp/",
  custom: "",
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return "0:00"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  return `${m}:${s.toString().padStart(2, "0")}`
}
