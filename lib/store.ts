// In-memory store for demo purposes - in production, this would be backed by a database
export type VideoStatus = "ready" | "uploading" | "processing" | "error"
export type StreamStatus = "idle" | "scheduled" | "live" | "completed" | "error"
export type Platform = "youtube" | "facebook" | "twitch" | "custom"

export interface Video {
  id: string
  name: string
  duration: string
  size: string
  thumbnail: string
  status: VideoStatus
  uploadedAt: string
  format: string
  resolution: string
}

export interface Destination {
  id: string
  platform: Platform
  name: string
  streamKey: string
  serverUrl: string
  enabled: boolean
  connected: boolean
}

export interface Stream {
  id: string
  title: string
  videoId: string
  videoName: string
  destinations: string[]
  status: StreamStatus
  scheduledAt: string | null
  startedAt: string | null
  endedAt: string | null
  viewers: number
  bitrate: number
  uptime: string
}

// Demo data
export const demoVideos: Video[] = [
  {
    id: "v1",
    name: "Product Launch Keynote 2026",
    duration: "1:24:30",
    size: "2.4 GB",
    thumbnail: "",
    status: "ready",
    uploadedAt: "2026-02-10",
    format: "MP4",
    resolution: "1920x1080",
  },
  {
    id: "v2",
    name: "Weekly Tech Podcast Ep. 47",
    duration: "45:12",
    size: "890 MB",
    thumbnail: "",
    status: "ready",
    uploadedAt: "2026-02-09",
    format: "MP4",
    resolution: "1920x1080",
  },
  {
    id: "v3",
    name: "Gaming Tournament Highlights",
    duration: "2:10:45",
    size: "4.1 GB",
    thumbnail: "",
    status: "ready",
    uploadedAt: "2026-02-08",
    format: "MKV",
    resolution: "2560x1440",
  },
  {
    id: "v4",
    name: "Cooking Masterclass - Italian Cuisine",
    duration: "58:20",
    size: "1.2 GB",
    thumbnail: "",
    status: "processing",
    uploadedAt: "2026-02-13",
    format: "MOV",
    resolution: "1920x1080",
  },
]

export const demoDestinations: Destination[] = [
  {
    id: "d1",
    platform: "youtube",
    name: "Main YouTube Channel",
    streamKey: "xxxx-xxxx-xxxx-xxxx",
    serverUrl: "rtmp://a.rtmp.youtube.com/live2",
    enabled: true,
    connected: true,
  },
  {
    id: "d2",
    platform: "twitch",
    name: "Twitch - streamforge_official",
    streamKey: "live_xxxxxxxx",
    serverUrl: "rtmp://live.twitch.tv/app",
    enabled: true,
    connected: true,
  },
  {
    id: "d3",
    platform: "facebook",
    name: "Facebook Gaming Page",
    streamKey: "FB-xxxx-xxxx",
    serverUrl: "rtmps://live-api-s.facebook.com:443/rtmp/",
    enabled: false,
    connected: true,
  },
  {
    id: "d4",
    platform: "custom",
    name: "Custom RTMP - Backup Server",
    streamKey: "custom_key_123",
    serverUrl: "rtmp://custom-server.example.com/live",
    enabled: true,
    connected: true,
  },
]

export const demoStreams: Stream[] = [
  {
    id: "s1",
    title: "Product Launch Keynote - LIVE",
    videoId: "v1",
    videoName: "Product Launch Keynote 2026",
    destinations: ["d1", "d2"],
    status: "live",
    scheduledAt: null,
    startedAt: "2026-02-13T14:00:00Z",
    endedAt: null,
    viewers: 1247,
    bitrate: 6000,
    uptime: "1:15:30",
  },
  {
    id: "s2",
    title: "Weekly Podcast Stream",
    videoId: "v2",
    videoName: "Weekly Tech Podcast Ep. 47",
    destinations: ["d1", "d3"],
    status: "scheduled",
    scheduledAt: "2026-02-14T18:00:00Z",
    startedAt: null,
    endedAt: null,
    viewers: 0,
    bitrate: 0,
    uptime: "0:00:00",
  },
  {
    id: "s3",
    title: "Gaming Highlights Premiere",
    videoId: "v3",
    videoName: "Gaming Tournament Highlights",
    destinations: ["d2", "d4"],
    status: "completed",
    scheduledAt: null,
    startedAt: "2026-02-12T20:00:00Z",
    endedAt: "2026-02-12T22:10:45Z",
    viewers: 3892,
    bitrate: 8000,
    uptime: "2:10:45",
  },
]
