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
import { Loader2, CheckCircle2 } from "lucide-react"

export default function SettingsPage() {
  const { data: settings, error: settingsError, mutate } = useSWR<UserSettings>("/api/settings", fetcher)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [localSettings, setLocalSettings] = useState<Partial<UserSettings>>({})

  useEffect(() => {
    if (settings) setLocalSettings(settings)
  }, [settings])

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
      </div>
    </div>
  )
}
