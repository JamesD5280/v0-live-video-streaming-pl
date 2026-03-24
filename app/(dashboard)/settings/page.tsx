"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { TopHeader } from "@/components/top-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { fetcher } from "@/lib/fetcher"
import type { UserSettings } from "@/lib/store"
import { Loader2, CheckCircle2, Server, Wifi, WifiOff, RefreshCw, Trash2, HardDrive } from "lucide-react"
import { TeamManager } from "@/components/team/team-manager"

export default function SettingsPage() {
  const { data: settings, error: settingsError, mutate } = useSWR<UserSettings>("/api/settings", fetcher)
  const { data: engineStatus, mutate: mutateEngine } = useSWR("/api/streams/engine", (url) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status" }),
    }).then((r) => r.json()),
    { refreshInterval: 10000 }
  )
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testError, setTestError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [localSettings, setLocalSettings] = useState<Partial<UserSettings>>({})
  const [diagnosing, setDiagnosing] = useState(false)
  const [diagResult, setDiagResult] = useState<string | null>(null)
  const [cleaningUp, setCleaningUp] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<{ deleted?: number; total?: number; error?: string } | null>(null)
  const [tempFileCount, setTempFileCount] = useState<number | null>(null)
  const [deletingVideos, setDeletingVideos] = useState(false)
  const [deleteVideosResult, setDeleteVideosResult] = useState<{ deleted?: number; error?: string } | null>(null)
  const [videoCount, setVideoCount] = useState<number | null>(null)

  useEffect(() => {
    if (settings) setLocalSettings(settings)
  }, [settings])

  useEffect(() => {
    checkTempFiles()
    checkVideoCount()
  }, [])

  const checkTempFiles = async () => {
    try {
      const res = await fetch("/api/admin/cleanup-temp")
      const data = await res.json()
      setTempFileCount(data.count || 0)
    } catch {
      setTempFileCount(null)
    }
  }

  const cleanupTempFiles = async () => {
    setCleaningUp(true)
    setCleanupResult(null)
    try {
      const res = await fetch("/api/admin/cleanup-temp", { method: "DELETE" })
      const data = await res.json()
      if (data.success) {
        setCleanupResult({ deleted: data.deleted, total: data.total })
        setTempFileCount(0)
      } else {
        setCleanupResult({ error: data.error || "Cleanup failed" })
      }
    } catch (err) {
      setCleanupResult({ error: err instanceof Error ? err.message : "Cleanup failed" })
    }
    setCleaningUp(false)
  }

  const checkVideoCount = async () => {
    try {
      const res = await fetch("/api/admin/delete-all-videos")
      const data = await res.json()
      setVideoCount(data.count || 0)
    } catch {
      setVideoCount(null)
    }
  }

  const deleteAllVideos = async () => {
    if (!confirm("Are you sure you want to delete ALL videos? This cannot be undone.")) return
    
    setDeletingVideos(true)
    setDeleteVideosResult(null)
    try {
      const res = await fetch("/api/admin/delete-all-videos", { method: "DELETE" })
      const data = await res.json()
      if (data.success) {
        setDeleteVideosResult({ deleted: data.deleted })
        setVideoCount(0)
      } else {
        setDeleteVideosResult({ error: data.error || "Delete failed" })
      }
    } catch (err) {
      setDeleteVideosResult({ error: err instanceof Error ? err.message : "Delete failed" })
    }
    setDeletingVideos(false)
  }

  const runDiagnostics = async () => {
    setDiagnosing(true)
    setDiagResult(null)
    const lines: string[] = []
    try {
      // 1. Check engine status
      lines.push("=== Step 1: Health Check ===")
      const statusRes = await fetch("/api/streams/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status" }),
      })
      const statusData = await statusRes.json()
      lines.push(JSON.stringify(statusData, null, 2))

      // 2. Check if streaming-server.js on VPS is real JS (test /videos endpoint)
      if (statusData.status === "ok" || statusData.configured) {
        lines.push("\n=== Step 2: Test /videos endpoint ===")
        try {
          const videosRes = await fetch("/api/streams/engine", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "test_videos" }),
          })
          const videosData = await videosRes.json()
          lines.push(JSON.stringify(videosData, null, 2))
        } catch (e) {
          lines.push(`Error: ${e instanceof Error ? e.message : String(e)}`)
        }
      }

      // 3. Show streams
      lines.push("\n=== Step 3: Current Streams ===")
      const streamsRes = await fetch("/api/streams")
      const streams = await streamsRes.json()
      if (Array.isArray(streams)) {
        lines.push(`Total streams: ${streams.length}`)
        for (const s of streams.slice(0, 5)) {
          lines.push(`  - ${s.title} [${s.status}] video=${s.video?.title || "none"} dests=${(s.stream_destinations || []).length}`)
        }
      } else {
        lines.push(JSON.stringify(streams, null, 2))
      }
    } catch (e) {
      lines.push(`Diagnostics failed: ${e instanceof Error ? e.message : String(e)}`)
    }
    setDiagResult(lines.join("\n"))
    setDiagnosing(false)
  }

  const testConnection = async () => {
    setTesting(true)
    setTestError(null)
    try {
      const res = await fetch("/api/streams/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status" }),
      })
      const data = await res.json()
      if (data.status === "ok" || data.status === "online") {
        setTestError(null)
      } else if (data.configured === false) {
        setTestError("STREAMING_SERVER_URL is not set in environment variables")
      } else if (data.errorDetail) {
        setTestError(data.errorDetail)
      } else {
        setTestError(`Server responded with status: ${data.status || "offline"}`)
      }
      mutateEngine()
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Failed to test connection")
    }
    setTesting(false)
  }

  const updateSetting = (key: string, value: unknown) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }))
  }

  const saveSettings = async () => {
    setSaving(true)
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(localSettings),
    })
    setSaving(false)
    setSaved(true)
    mutate()
    setTimeout(() => setSaved(false), 2000)
  }

  if (settingsError) {
    return (
      <div className="flex flex-col">
        <TopHeader title="Settings" />
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-sm font-medium text-foreground">Failed to load settings</p>
          <p className="mt-1 text-xs text-muted-foreground">Please try refreshing the page</p>
        </div>
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="flex flex-col">
        <TopHeader title="Settings" />
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <TopHeader title="Settings" />
      <div className="flex-1 space-y-6 p-6">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Server className="h-4 w-4" />
              Streaming Engine
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              {engineStatus?.status === "ok" ? (
                <>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                    <Wifi className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Connected</p>
                    <p className="text-xs text-muted-foreground">
                      {engineStatus.activeStreams || 0} active stream(s) -- Uptime: {Math.floor((engineStatus.uptime || 0) / 60)}m
                    </p>
                  </div>
                </>
              ) : engineStatus?.configured === false ? (
                <>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                    <WifiOff className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Not Configured</p>
                    <p className="text-xs text-muted-foreground">Set STREAMING_SERVER_URL in environment variables</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10">
                    <WifiOff className="h-4 w-4 text-destructive" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Offline</p>
                    <p className="text-xs text-muted-foreground">The streaming engine is not responding. Make sure it is running on your server.</p>
                  </div>
                </>
              )}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={testConnection} disabled={testing}>
                {testing ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-2 h-3 w-3" />}
                Test Connection
              </Button>
              <span className="text-xs text-muted-foreground">
                URL: {engineStatus?.serverUrl || "not configured"}
              </span>
            </div>
            {testError && (
              <div className="mt-3 rounded-md bg-destructive/10 p-3">
                <p className="text-xs font-medium text-destructive">Connection Error:</p>
                <p className="mt-1 font-mono text-xs text-destructive/80">{testError}</p>
              </div>
            )}

            <Separator className="my-4 bg-border" />

            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Deploy / Update Streaming Engine</p>
              <p className="text-xs text-muted-foreground">
                Run these commands on your VPS to install or update the streaming engine:
              </p>
              <pre className="overflow-x-auto rounded-md bg-secondary p-3 text-xs text-foreground font-mono leading-relaxed">
{`cd /opt/2mstream
# Download the latest streaming server
curl -L "${typeof window !== "undefined" ? window.location.origin : ""}/api/download-server" -o streaming-server.js
curl -L "${typeof window !== "undefined" ? window.location.origin : ""}/api/download-server?file=package.json" -o package.json
npm install
# Restart the server (using pm2 or systemd)
pm2 restart streaming-server || node streaming-server.js`}
              </pre>
            </div>

            <Separator className="my-4 bg-border" />

            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Diagnostics</p>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={runDiagnostics} disabled={diagnosing}>
                  {diagnosing ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Server className="mr-2 h-3 w-3" />}
                  Run Diagnostics
                </Button>
              </div>
              {diagResult && (
                <pre className="max-h-64 overflow-auto rounded-md bg-secondary p-3 text-xs text-foreground font-mono leading-relaxed whitespace-pre-wrap">
                  {diagResult}
                </pre>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <HardDrive className="h-4 w-4" />
              Bunny CDN Storage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground">Cleanup Temporary Uploads</p>
                <p className="text-xs text-muted-foreground">
                  Delete incomplete upload chunks from Bunny storage. This won&apos;t affect completed videos.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {tempFileCount !== null && tempFileCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {tempFileCount} temp file(s) found
                  </span>
                )}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={cleanupTempFiles} 
                  disabled={cleaningUp || tempFileCount === 0}
                >
                  {cleaningUp ? (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-3 w-3" />
                  )}
                  {cleaningUp ? "Deleting..." : "Delete All Temp Files"}
                </Button>
                <Button variant="ghost" size="sm" onClick={checkTempFiles}>
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
              {cleanupResult && (
                <div className={`rounded-md p-3 ${cleanupResult.error ? "bg-destructive/10" : "bg-primary/10"}`}>
                  {cleanupResult.error ? (
                    <p className="text-xs text-destructive">{cleanupResult.error}</p>
                  ) : (
                    <p className="text-xs text-primary">
                      Successfully deleted {cleanupResult.deleted} of {cleanupResult.total} temp files
                    </p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Trash2 className="h-4 w-4" />
              Delete All Videos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground">Remove All Videos</p>
                <p className="text-xs text-muted-foreground">
                  This will delete all video records from your database. Use this to clean up incomplete uploads or unwanted videos.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {videoCount !== null && videoCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {videoCount} video(s) found
                  </span>
                )}
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={deleteAllVideos} 
                  disabled={deletingVideos || videoCount === 0}
                >
                  {deletingVideos ? (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-3 w-3" />
                  )}
                  {deletingVideos ? "Deleting..." : "Delete All Videos"}
                </Button>
                <Button variant="ghost" size="sm" onClick={checkVideoCount}>
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
              {deleteVideosResult && (
                <div className={`rounded-md p-3 ${deleteVideosResult.error ? "bg-destructive/10" : "bg-primary/10"}`}>
                  {deleteVideosResult.error ? (
                    <p className="text-xs text-destructive">{deleteVideosResult.error}</p>
                  ) : (
                    <p className="text-xs text-primary">
                      Successfully deleted {deleteVideosResult.deleted} video(s)
                    </p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">Stream Defaults</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-foreground">Default Resolution</Label>
                <Select value={localSettings.default_resolution || "1080p"} onValueChange={(v) => updateSetting("default_resolution", v)}>
                  <SelectTrigger className="bg-secondary border-border text-foreground"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="720p">720p (HD)</SelectItem>
                    <SelectItem value="1080p">1080p (Full HD)</SelectItem>
                    <SelectItem value="1440p">1440p (2K)</SelectItem>
                    <SelectItem value="2160p">2160p (4K)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Default Bitrate</Label>
                <Select value={localSettings.default_bitrate || "4500"} onValueChange={(v) => updateSetting("default_bitrate", v)}>
                  <SelectTrigger className="bg-secondary border-border text-foreground"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="3000">3000 kbps</SelectItem>
                    <SelectItem value="4500">4500 kbps</SelectItem>
                    <SelectItem value="6000">6000 kbps</SelectItem>
                    <SelectItem value="8000">8000 kbps</SelectItem>
                    <SelectItem value="10000">10000 kbps</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Frame Rate</Label>
                <Select value={localSettings.default_framerate || "30"} onValueChange={(v) => updateSetting("default_framerate", v)}>
                  <SelectTrigger className="bg-secondary border-border text-foreground"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="24">24 fps</SelectItem>
                    <SelectItem value="30">30 fps</SelectItem>
                    <SelectItem value="60">60 fps</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Audio Bitrate</Label>
                <Select value={localSettings.default_audio_bitrate || "128"} onValueChange={(v) => updateSetting("default_audio_bitrate", v)}>
                  <SelectTrigger className="bg-secondary border-border text-foreground"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="96">96 kbps</SelectItem>
                    <SelectItem value="128">128 kbps</SelectItem>
                    <SelectItem value="192">192 kbps</SelectItem>
                    <SelectItem value="320">320 kbps</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Stream Started</p>
                <p className="text-xs text-muted-foreground">Notify when a scheduled stream starts</p>
              </div>
              <Switch checked={localSettings.notify_stream_start ?? true} onCheckedChange={(v) => updateSetting("notify_stream_start", v)} aria-label="Toggle stream start notification" />
            </div>
            <Separator className="bg-border" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Stream Ended</p>
                <p className="text-xs text-muted-foreground">Notify when a stream completes</p>
              </div>
              <Switch checked={localSettings.notify_stream_end ?? true} onCheckedChange={(v) => updateSetting("notify_stream_end", v)} aria-label="Toggle stream end notification" />
            </div>
            <Separator className="bg-border" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Stream Errors</p>
                <p className="text-xs text-muted-foreground">Notify on stream failures or issues</p>
              </div>
              <Switch checked={localSettings.notify_stream_error ?? true} onCheckedChange={(v) => updateSetting("notify_stream_error", v)} aria-label="Toggle stream error notification" />
            </div>
            <Separator className="bg-border" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Schedule Reminders</p>
                <p className="text-xs text-muted-foreground">Remind before scheduled streams</p>
              </div>
              <Switch checked={localSettings.notify_schedule_reminder ?? true} onCheckedChange={(v) => updateSetting("notify_schedule_reminder", v)} aria-label="Toggle schedule reminder notification" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">Webhook Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-foreground">Webhook URL</Label>
              <Input
                value={localSettings.webhook_url || ""}
                onChange={(e) => updateSetting("webhook_url", e.target.value || null)}
                placeholder="https://your-server.com/webhook"
                className="bg-secondary border-border font-mono text-sm text-foreground"
              />
              <p className="text-xs text-muted-foreground">Receive POST notifications for stream events at this URL.</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button onClick={saveSettings} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save All Settings
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" />
              Saved
            </span>
          )}
        </div>

        <Separator className="bg-border" />

        {/* Team Management */}
        <TeamManager />
      </div>
    </div>
  )
}
