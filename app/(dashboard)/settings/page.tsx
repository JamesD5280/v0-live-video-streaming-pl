"use client"

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

export default function SettingsPage() {
  return (
    <div className="flex flex-col">
      <TopHeader title="Settings" />
      <div className="flex-1 space-y-6 p-6">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">
              Stream Defaults
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-foreground">Default Resolution</Label>
                <Select defaultValue="1080">
                  <SelectTrigger className="bg-secondary border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="720">720p (HD)</SelectItem>
                    <SelectItem value="1080">1080p (Full HD)</SelectItem>
                    <SelectItem value="1440">1440p (2K)</SelectItem>
                    <SelectItem value="2160">2160p (4K)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Default Bitrate</Label>
                <Select defaultValue="6000">
                  <SelectTrigger className="bg-secondary border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
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
                <Select defaultValue="30">
                  <SelectTrigger className="bg-secondary border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="24">24 fps</SelectItem>
                    <SelectItem value="30">30 fps</SelectItem>
                    <SelectItem value="60">60 fps</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Audio Bitrate</Label>
                <Select defaultValue="128">
                  <SelectTrigger className="bg-secondary border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
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
            <CardTitle className="text-base font-semibold text-foreground">
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Stream Started</p>
                <p className="text-xs text-muted-foreground">Notify when a scheduled stream starts</p>
              </div>
              <Switch defaultChecked aria-label="Toggle stream started notification" />
            </div>
            <Separator className="bg-border" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Stream Ended</p>
                <p className="text-xs text-muted-foreground">Notify when a stream completes</p>
              </div>
              <Switch defaultChecked aria-label="Toggle stream ended notification" />
            </div>
            <Separator className="bg-border" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Stream Errors</p>
                <p className="text-xs text-muted-foreground">Notify on stream failures or issues</p>
              </div>
              <Switch defaultChecked aria-label="Toggle stream error notification" />
            </div>
            <Separator className="bg-border" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Upload Complete</p>
                <p className="text-xs text-muted-foreground">Notify when video processing is done</p>
              </div>
              <Switch aria-label="Toggle upload complete notification" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">
              Webhook Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-foreground">Webhook URL</Label>
              <Input
                placeholder="https://your-server.com/webhook"
                className="bg-secondary border-border font-mono text-sm text-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Receive POST notifications for stream events at this URL.
              </p>
            </div>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              Save Webhook
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
