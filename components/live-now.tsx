"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import useSWR from "swr"
import { AlertCircle, Cast, Loader2, Play, Radio, Video } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { fetcher } from "@/lib/fetcher"
import { platformLabels, type Stream } from "@/lib/store"

function getThumbnail(stream: Stream) {
  const playlistThumbnail = stream.playlist?.playlist_items?.find(
    (item) => item.video?.thumbnail_path
  )?.video?.thumbnail_path

  return stream.video?.thumbnail_path || playlistThumbnail || null
}

function getSourceLabel(stream: Stream) {
  if (stream.rtmp_pull_url) return "RTMP input"
  if (stream.playlist?.name) return `Playlist · ${stream.playlist.name}`
  return stream.video?.title || "Source unavailable"
}

function getPreviewPayload(stream: Stream) {
  const payload: {
    videoId?: string
    playlistId?: string
    rtmpPullUrl?: string
    overlayIds: string[]
  } = {
    overlayIds: (stream.stream_overlays || [])
      .map((item) => item.overlay_id)
      .filter((id): id is string => Boolean(id)),
  }

  if (stream.rtmp_pull_url) payload.rtmpPullUrl = stream.rtmp_pull_url
  else if (stream.video_id) payload.videoId = stream.video_id
  else if (stream.playlist_id) payload.playlistId = stream.playlist_id

  return payload
}

function LiveStreamCard({
  stream,
  onPreview,
}: {
  stream: Stream
  onPreview: (stream: Stream) => void
}) {
  const thumbnail = getThumbnail(stream)
  const destinations = (stream.stream_destinations || [])
    .map((item) => item.destination)
    .filter((destination): destination is NonNullable<typeof destination> => Boolean(destination))

  return (
    <Card className="group overflow-hidden border-border bg-card p-0 transition-colors hover:border-primary/50">
      <button
        type="button"
        onClick={() => onPreview(stream)}
        aria-label={`Preview ${stream.title}, live now`}
        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <CardContent className="p-0">
          <div className="relative aspect-video overflow-hidden bg-secondary">
            {thumbnail ? (
              <Image
                src={thumbnail}
                alt=""
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <Video className="size-8" aria-hidden="true" />
                <span className="text-xs">Thumbnail unavailable</span>
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-background/0 transition-colors group-hover:bg-background/20">
              <span className="flex size-12 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                <Play className="ml-0.5 size-5" aria-hidden="true" />
              </span>
            </div>
            <Badge className="absolute left-3 top-3 gap-1.5 border-0 bg-success text-success-foreground shadow-sm">
              <span className="size-2 rounded-full bg-success-foreground" aria-hidden="true" />
              LIVE
            </Badge>
          </div>

          <div className="flex flex-col gap-3 p-4">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-foreground">{stream.title}</h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">{getSourceLabel(stream)}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {destinations.length > 0 ? (
                destinations.map((destination) => (
                  <Badge
                    key={destination.id}
                    variant="outline"
                    className="max-w-full truncate border-border bg-secondary/60 text-muted-foreground"
                  >
                    <span className="truncate">{destination.name || platformLabels[destination.platform]}</span>
                    <span aria-hidden="true"> · {platformLabels[destination.platform]}</span>
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">No destinations listed</span>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">
                {stream.viewer_count
                  ? `${stream.viewer_count.toLocaleString()} ${stream.viewer_count === 1 ? "viewer" : "viewers"}`
                  : "Streaming now"}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                <Cast className="size-3.5" aria-hidden="true" />
                Preview source
              </span>
            </div>
          </div>
        </CardContent>
      </button>
    </Card>
  )
}

function LiveStreamPreview({
  stream,
  previewUrl,
  loading,
  error,
  onClose,
  onPlaybackError,
}: {
  stream: Stream | null
  previewUrl: string | null
  loading: boolean
  error: string | null
  onClose: () => void
  onPlaybackError: () => void
}) {
  const destinations = (stream?.stream_destinations || [])
    .map((item) => item.destination)
    .filter((destination): destination is NonNullable<typeof destination> => Boolean(destination))

  return (
    <Dialog open={Boolean(stream)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl overflow-hidden border-border bg-card p-0">
        <DialogHeader className="border-b border-border p-5 pr-12">
          <DialogTitle className="truncate text-foreground">{stream?.title || "Stream preview"}</DialogTitle>
          <DialogDescription>
            A short preview clip generated from this stream&apos;s source, not a playback feed from the destination.
          </DialogDescription>
        </DialogHeader>

        <div className="relative flex aspect-video items-center justify-center bg-background">
          {previewUrl ? (
            <video
              key={previewUrl}
              src={previewUrl}
              autoPlay
              muted
              controls
              playsInline
              className="size-full object-contain"
              onError={onPlaybackError}
            />
          ) : loading ? (
            <div className="flex flex-col items-center gap-3 text-muted-foreground" role="status">
              <Loader2 className="size-8 animate-spin" aria-hidden="true" />
              <span className="text-sm">Generating preview…</span>
            </div>
          ) : error ? (
            <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center" role="alert">
              <AlertCircle className="size-8 text-destructive" aria-hidden="true" />
              <p className="text-sm text-foreground">{error}</p>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Radio className="size-4" aria-hidden="true" />
              Preview not available
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Destinations</p>
            <p className="mt-1 truncate text-sm text-foreground">
              {destinations.length > 0
                ? destinations.map((destination) => destination.name || platformLabels[destination.platform]).join(", ")
                : "No destinations listed"}
            </p>
          </div>
          <p className="shrink-0 text-xs text-muted-foreground">{stream ? getSourceLabel(stream) : ""}</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function LiveNow() {
  const { data: streams, error } = useSWR<Stream[]>("/api/streams", fetcher, {
    refreshInterval: 5000,
    revalidateOnFocus: true,
  })
  const [selectedStream, setSelectedStream] = useState<Stream | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const previewRequest = useRef<AbortController | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const liveStreams = Array.isArray(streams) ? streams.filter((stream) => stream.status === "live") : []

  useEffect(() => {
    return () => {
      previewRequest.current?.abort()
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  const closePreview = () => {
    previewRequest.current?.abort()
    previewRequest.current = null
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
    setSelectedStream(null)
    setPreviewUrl(null)
    setPreviewLoading(false)
    setPreviewError(null)
  }

  const handlePlaybackError = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
    setPreviewUrl(null)
    setPreviewLoading(false)
    setPreviewError("This preview could not be played in your browser.")
  }

  const openPreview = async (stream: Stream) => {
    previewRequest.current?.abort()
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
    setSelectedStream(stream)
    setPreviewUrl(null)
    setPreviewError(null)
    setPreviewLoading(true)

    const controller = new AbortController()
    previewRequest.current = controller

    try {
      const response = await fetch("/api/streams/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getPreviewPayload(stream)),
        signal: controller.signal,
      })

      if (!response.ok) {
        const result = await response.json().catch(() => null)
        throw new Error(result?.error || "Unable to generate a preview for this stream.")
      }

      const url = URL.createObjectURL(await response.blob())
      if (controller.signal.aborted) {
        URL.revokeObjectURL(url)
        return
      }
      previewUrlRef.current = url
      setPreviewUrl(url)
    } catch (previewFailure) {
      if (!controller.signal.aborted) {
        setPreviewError(
          previewFailure instanceof Error
            ? previewFailure.message
            : "Unable to generate a preview for this stream."
        )
      }
    } finally {
      if (previewRequest.current === controller) {
        previewRequest.current = null
        setPreviewLoading(false)
      }
    }
  }

  return (
    <section aria-labelledby="live-now-heading" className="flex flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 id="live-now-heading" className="text-balance text-3xl font-semibold tracking-tight text-foreground">
            Live Now
          </h1>
          {liveStreams.length > 0 && (
            <Badge className="border-0 bg-success text-success-foreground">
              {liveStreams.length} {liveStreams.length === 1 ? "stream" : "streams"} live
            </Badge>
          )}
        </div>
        <p className="mt-2 text-pretty text-base leading-relaxed text-muted-foreground">
          All currently running streams. Select a card to preview its source.
        </p>
      </div>

      {error ? (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <AlertCircle className="size-8 text-destructive" aria-hidden="true" />
            <h2 className="font-medium text-foreground">Could not load live streams</h2>
            <p className="max-w-md text-sm text-muted-foreground">Refresh the page and try again.</p>
          </CardContent>
        </Card>
      ) : !streams ? (
        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3" aria-label="Loading live streams">
          {[0, 1, 2].map((item) => (
            <Card key={item} className="overflow-hidden border-border bg-card p-0">
              <Skeleton className="aspect-video rounded-none" />
              <div className="flex flex-col gap-3 p-4">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </Card>
          ))}
        </div>
      ) : liveStreams.length > 0 ? (
        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {liveStreams.map((stream) => (
            <LiveStreamCard key={stream.id} stream={stream} onPreview={openPreview} />
          ))}
        </div>
      ) : (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <Radio className="size-6" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">No streams are live</h2>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Active broadcasts will appear here with their destinations and a source preview.
            </p>
            <Button asChild className="mt-2">
              <Link href="/streams">Create a stream</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <LiveStreamPreview
        stream={selectedStream}
        previewUrl={previewUrl}
        loading={previewLoading}
        error={previewError}
        onClose={closePreview}
        onPlaybackError={handlePlaybackError}
      />
    </section>
  )
}
