"use client"

import { useState } from "react"
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
import { demoDestinations, type Destination, type Platform } from "@/lib/store"
import { Plus, Trash2, Eye, EyeOff, Settings2 } from "lucide-react"
import { cn } from "@/lib/utils"

const platformConfig: Record<Platform, { label: string; abbr: string; color: string }> = {
  youtube: { label: "YouTube", abbr: "YT", color: "bg-red-500/10 text-red-400 border-red-500/20" },
  twitch: { label: "Twitch", abbr: "TW", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  facebook: { label: "Facebook", abbr: "FB", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  custom: { label: "Custom RTMP", abbr: "RT", color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
}

export function DestinationList() {
  const [destinations, setDestinations] = useState<Destination[]>(demoDestinations)
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newDest, setNewDest] = useState({
    platform: "youtube" as Platform,
    name: "",
    streamKey: "",
    serverUrl: "",
  })

  const toggleEnabled = (id: string) => {
    setDestinations((prev) =>
      prev.map((d) => (d.id === id ? { ...d, enabled: !d.enabled } : d))
    )
  }

  const toggleShowKey = (id: string) => {
    setShowKeys((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const removeDestination = (id: string) => {
    setDestinations((prev) => prev.filter((d) => d.id !== id))
  }

  const addDestination = () => {
    const dest: Destination = {
      id: `d${Date.now()}`,
      platform: newDest.platform,
      name: newDest.name,
      streamKey: newDest.streamKey,
      serverUrl: newDest.serverUrl,
      enabled: true,
      connected: true,
    }
    setDestinations((prev) => [...prev, dest])
    setNewDest({ platform: "youtube", name: "", streamKey: "", serverUrl: "" })
    setDialogOpen(false)
  }

  const getDefaultServer = (platform: Platform) => {
    switch (platform) {
      case "youtube":
        return "rtmp://a.rtmp.youtube.com/live2"
      case "twitch":
        return "rtmp://live.twitch.tv/app"
      case "facebook":
        return "rtmps://live-api-s.facebook.com:443/rtmp/"
      default:
        return ""
    }
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
                  onValueChange={(val: Platform) => {
                    setNewDest({
                      ...newDest,
                      platform: val,
                      serverUrl: getDefaultServer(val),
                    })
                  }}
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
                  value={newDest.serverUrl}
                  onChange={(e) => setNewDest({ ...newDest, serverUrl: e.target.value })}
                  placeholder="rtmp://..."
                  className="bg-secondary border-border font-mono text-sm text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Stream Key</Label>
                <Input
                  value={newDest.streamKey}
                  onChange={(e) => setNewDest({ ...newDest, streamKey: e.target.value })}
                  placeholder="Enter your stream key"
                  type="password"
                  className="bg-secondary border-border font-mono text-sm text-foreground"
                />
              </div>
              <Button
                onClick={addDestination}
                disabled={!newDest.name || !newDest.streamKey}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Add Destination
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {destinations.map((dest) => {
          const config = platformConfig[dest.platform]
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
                        <Badge
                          variant="outline"
                          className={cn("text-xs", config.color)}
                        >
                          {config.label}
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <code className="text-xs font-mono text-muted-foreground">
                          {dest.serverUrl}
                        </code>
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        <code className="text-xs font-mono text-muted-foreground">
                          Key: {showKeys[dest.id] ? dest.streamKey : "****-****-****"}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-muted-foreground hover:text-foreground"
                          onClick={() => toggleShowKey(dest.id)}
                        >
                          {showKeys[dest.id] ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                          <span className="sr-only">Toggle stream key visibility</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "h-2 w-2 rounded-full",
                          dest.connected ? "bg-success" : "bg-destructive"
                        )}
                      />
                      <span className="text-xs text-muted-foreground">
                        {dest.connected ? "Connected" : "Error"}
                      </span>
                    </div>
                    <Switch
                      checked={dest.enabled}
                      onCheckedChange={() => toggleEnabled(dest.id)}
                      aria-label={`Toggle ${dest.name}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    >
                      <Settings2 className="h-4 w-4" />
                      <span className="sr-only">Settings</span>
                    </Button>
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
    </div>
  )
}
