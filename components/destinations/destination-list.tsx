"use client"

import { useState } from "react"
import useSWR from "swr"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { type Destination, type Platform, platformRtmpUrls } from "@/lib/store"
import { fetcher } from "@/lib/fetcher"
import { Plus, Trash2, Eye, EyeOff, Globe, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

const platformConfig: Record<Platform, { label: string; abbr: string; color: string }> = {
  youtube: { label: "YouTube", abbr: "YT", color: "bg-red-500/10 text-red-400 border-red-500/20" },
  twitch: { label: "Twitch", abbr: "TW", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  facebook: { label: "Facebook", abbr: "FB", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  custom: { label: "Custom RTMP", abbr: "RT", color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
}

export function DestinationList() {
  const { data: destinations, error: fetchError, mutate } = useSWR<Destination[]>("/api/destinations", fetcher)
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newDest, setNewDest] = useState({
    platform: "youtube" as Platform,
    name: "",
    stream_key: "",
    rtmp_url: platformRtmpUrls.youtube,
  })

  const toggleEnabled = async (dest: Destination) => {
    await fetch("/api/destinations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: dest.id, enabled: !dest.enabled }),
    })
    mutate()
  }

  const toggleShowKey = (id: string) => {
    setShowKeys((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const removeDestination = async (id: string) => {
    await fetch(`/api/destinations?id=${id}`, { method: "DELETE" })
    mutate()
  }

  const addDestination = async () => {
    setSaving(true)
    await fetch("/api/destinations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newDest),
    })
    setNewDest({ platform: "youtube", name: "", stream_key: "", rtmp_url: platformRtmpUrls.youtube })
    setDialogOpen(false)
    setSaving(false)
    mutate()
  }

  if (fetchError) {
    return (
      <div className="rounded-lg border border-dashed border-border p-12 text-center">
        <Globe className="mx-auto h-10 w-10 text-destructive" />
        <p className="mt-3 text-sm font-medium text-foreground">Failed to load destinations</p>
        <p className="mt-1 text-xs text-muted-foreground">Please try refreshing the page</p>
      </div>
    )
  }

  if (!destinations) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Streaming Destinations</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure where your videos will be streamed. Enable or disable destinations per stream.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="h-3.5 w-3.5" />
              Add Destination
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Add Streaming Destination</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-foreground">Platform</Label>
                <Select
                  value={newDest.platform}
                  onValueChange={(val: Platform) =>
                    setNewDest({
                      ...newDest,
                      platform: val,
                      rtmp_url: platformRtmpUrls[val] || "",
                    })
                  }
                >
                  <SelectTrigger className="bg-secondary border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="twitch">Twitch</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="custom">Custom RTMP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Display Name</Label>
                <Input
                  value={newDest.name}
                  onChange={(e) => setNewDest({ ...newDest, name: e.target.value })}
                  placeholder="My YouTube Channel"
                  className="bg-secondary border-border text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Server URL</Label>
                <Input
                  value={newDest.rtmp_url}
                  onChange={(e) => setNewDest({ ...newDest, rtmp_url: e.target.value })}
                  placeholder="rtmp://..."
                  className="bg-secondary border-border font-mono text-sm text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Stream Key</Label>
                <Input
                  value={newDest.stream_key}
                  onChange={(e) => setNewDest({ ...newDest, stream_key: e.target.value })}
                  placeholder="Enter your stream key"
                  type="password"
                  className="bg-secondary border-border font-mono text-sm text-foreground"
                />
              </div>
              <Button
                onClick={addDestination}
                disabled={!newDest.name || !newDest.stream_key || saving}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Add Destination
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {destinations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Globe className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">No destinations yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Add your first streaming destination to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {destinations.map((dest) => {
            const config = platformConfig[dest.platform] || platformConfig.custom
            return (
              <Card key={dest.id} className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div
                        className={cn(
                          "flex h-12 w-12 items-center justify-center rounded-lg text-sm font-bold",
                          config.color.split(" ").slice(0, 2).join(" ")
                        )}
                      >
                        {config.abbr}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{dest.name}</p>
                          <Badge variant="outline" className={cn("text-xs", config.color)}>
                            {config.label}
                          </Badge>
                        </div>
                        <code className="mt-1 block text-xs font-mono text-muted-foreground">
                          {dest.rtmp_url}
                        </code>
                        <div className="mt-1 flex items-center gap-1">
                          <code className="text-xs font-mono text-muted-foreground">
                            Key: {showKeys[dest.id] ? dest.stream_key : "****-****-****"}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-muted-foreground hover:text-foreground"
                            onClick={() => toggleShowKey(dest.id)}
                          >
                            {showKeys[dest.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            <span className="sr-only">Toggle key visibility</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={dest.enabled}
                        onCheckedChange={() => toggleEnabled(dest)}
                        aria-label={`Toggle ${dest.name}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeDestination(dest.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete destination</span>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
