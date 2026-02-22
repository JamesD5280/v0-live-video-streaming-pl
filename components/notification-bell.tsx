"use client"

import { useState } from "react"
import useSWR from "swr"
import { Bell, Check, Trash2, Radio, Calendar, AlertCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface Notification {
  id: string
  type: string
  title: string
  message: string
  read: boolean
  created_at: string
  stream_id: string | null
  scheduled_event_id: string | null
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function getIcon(type: string) {
  switch (type) {
    case "schedule_started":
      return <Radio className="h-4 w-4 text-green-500" />
    case "schedule_error":
      return <AlertCircle className="h-4 w-4 text-red-500" />
    case "stream_ended":
      return <Radio className="h-4 w-4 text-muted-foreground" />
    default:
      return <Calendar className="h-4 w-4 text-primary" />
  }
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function NotificationBell() {
  const { data: notifications = [], mutate } = useSWR<Notification[]>(
    "/api/notifications",
    fetcher,
    { refreshInterval: 30000 }
  )
  const [open, setOpen] = useState(false)

  const unreadCount = Array.isArray(notifications)
    ? notifications.filter((n) => !n.read).length
    : 0

  const markAllRead = async () => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    })
    mutate()
  }

  const markRead = async (id: string) => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    mutate()
  }

  const clearAll = async () => {
    await fetch("/api/notifications", { method: "DELETE" })
    mutate()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 text-muted-foreground hover:text-foreground"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 border-border bg-card p-0"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={markAllRead}
              >
                <Check className="mr-1 h-3 w-3" />
                Mark all read
              </Button>
            )}
            {Array.isArray(notifications) && notifications.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={clearAll}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="sr-only">Clear all</span>
              </Button>
            )}
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {!Array.isArray(notifications) || notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                className={cn(
                  "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50",
                  !n.read && "bg-primary/5"
                )}
                onClick={() => {
                  if (!n.read) markRead(n.id)
                }}
              >
                <div className="mt-0.5 shrink-0">{getIcon(n.type)}</div>
                <div className="min-w-0 flex-1">
                  <p className={cn(
                    "text-sm text-foreground",
                    !n.read && "font-medium"
                  )}>
                    {n.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                    {n.message}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground/70">
                    {timeAgo(n.created_at)}
                  </p>
                </div>
                {!n.read && (
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
