"use client"

import { useState, type FormEvent } from "react"
import useSWR from "swr"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Film,
  FolderOpen,
  FolderPlus,
  Loader2,
  MoreVertical,
  Play,
  Radio,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { fetcher } from "@/lib/fetcher"
import { formatFileSize, formatDuration, type Video, type VideoCategory } from "@/lib/store"
import { VideoPreviewDialog } from "./video-preview-dialog"
import { useLanguage } from "@/components/language-provider"

type VideoCategoriesResponse = {
  categories: VideoCategory[]
  canManage: boolean
}

const statusConfig: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  ready: { label: "Ready", className: "bg-primary/10 text-primary border-primary/20", icon: CheckCircle2 },
  uploading: { label: "Queued for assembly", className: "bg-warning/10 text-warning border-warning/20", icon: Loader2 },
  processing: { label: "Processing", className: "bg-chart-2/10 text-chart-2 border-chart-2/20", icon: Loader2 },
  error: { label: "Error", className: "bg-destructive/10 text-destructive border-destructive/20", icon: AlertCircle },
}

export function VideoList() {
  const { locale, t } = useLanguage()
  const { data: videos, error, mutate } = useSWR<Video[]>("/api/videos", fetcher, {
    refreshInterval: (latestVideos) =>
      latestVideos?.some((video) => video.status === "uploading" || video.status === "processing") ? 15_000 : 0,
  })
  const {
    data: categoryResponse,
    error: categoriesError,
    mutate: mutateCategories,
  } = useSWR<VideoCategoriesResponse>("/api/video-categories", fetcher)
  const [previewVideo, setPreviewVideo] = useState<Video | null>(null)
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [categoryName, setCategoryName] = useState("")
  const [categoryNotice, setCategoryNotice] = useState<string | null>(null)
  const [isCreatingCategory, setIsCreatingCategory] = useState(false)
  const [updatingVideoId, setUpdatingVideoId] = useState<string | null>(null)

  const categories = categoryResponse?.categories ?? []
  const canManageCategories = categoryResponse?.canManage ?? false

  const handleDelete = async (id: string) => {
    await fetch(`/api/videos?id=${id}`, { method: "DELETE" })
    mutate()
  }

  const handleCreateCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = categoryName.trim()
    if (!name || isCreatingCategory) return

    setIsCreatingCategory(true)
    setCategoryNotice(null)
    try {
      const response = await fetch("/api/video-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })

      if (!response.ok) {
        setCategoryNotice(
          response.status === 409
            ? t("A category with that name already exists")
            : response.status === 403
              ? t("Only editors and admins can manage categories")
              : t("Could not create category"),
        )
        return
      }

      setCategoryName("")
      await mutateCategories()
    } catch {
      setCategoryNotice(t("Could not create category"))
    } finally {
      setIsCreatingCategory(false)
    }
  }

  const handleCategoryChange = async (videoId: string, categoryId: string | null) => {
    if (updatingVideoId) return

    setUpdatingVideoId(videoId)
    setCategoryNotice(null)
    try {
      const response = await fetch("/api/videos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: videoId, category_id: categoryId }),
      })

      if (!response.ok) {
        setCategoryNotice(
          response.status === 403
            ? t("Only editors and admins can manage categories")
            : t("Could not update video category"),
        )
        return
      }

      await mutate()
    } catch {
      setCategoryNotice(t("Could not update video category"))
    } finally {
      setUpdatingVideoId(null)
    }
  }

  if (error) {
    return (
      <div className="rounded-lg border border-dashed border-border p-12 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
        <p className="mt-3 text-sm font-medium text-foreground">{t("Failed to load videos")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("Please try refreshing the page")}</p>
      </div>
    )
  }

  if (!videos) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const uncategorizedCount = videos.filter((video) => !video.category_id).length
  const filteredVideos = videos.filter((video) => {
    if (selectedCategory === "all") return true
    if (selectedCategory === "uncategorized") return !video.category_id
    return video.category_id === selectedCategory
  })
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]))

  return (
    <div className="space-y-4">
      <section aria-label={t("Categories")} className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Categories")}</h3>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t("Filter videos by category")}>
              <Button
                type="button"
                size="sm"
                variant={selectedCategory === "all" ? "secondary" : "outline"}
                aria-pressed={selectedCategory === "all"}
                onClick={() => setSelectedCategory("all")}
              >
                {t("All videos")} <span className="text-xs text-muted-foreground">{videos.length}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={selectedCategory === "uncategorized" ? "secondary" : "outline"}
                aria-pressed={selectedCategory === "uncategorized"}
                onClick={() => setSelectedCategory("uncategorized")}
              >
                {t("Uncategorized")} <span className="text-xs text-muted-foreground">{uncategorizedCount}</span>
              </Button>
              {categories.map((category) => {
                const count = videos.filter((video) => video.category_id === category.id).length
                return (
                  <Button
                    key={category.id}
                    type="button"
                    size="sm"
                    variant={selectedCategory === category.id ? "secondary" : "outline"}
                    aria-pressed={selectedCategory === category.id}
                    onClick={() => setSelectedCategory(category.id)}
                  >
                    <FolderOpen data-icon="inline-start" />
                    {category.name} <span className="text-xs text-muted-foreground">{count}</span>
                  </Button>
                )
              })}
            </div>
          </div>

          {canManageCategories && (
            <form className="flex w-full gap-2 lg:max-w-sm" onSubmit={handleCreateCategory}>
              <label className="sr-only" htmlFor="new-video-category">{t("New category")}</label>
              <Input
                id="new-video-category"
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                placeholder={t("New category")}
                maxLength={64}
                className="min-w-0 flex-1"
              />
              <Button type="submit" size="sm" disabled={!categoryName.trim() || isCreatingCategory}>
                {isCreatingCategory ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <FolderPlus data-icon="inline-start" />
                )}
                {t("Add category")}
              </Button>
            </form>
          )}
        </div>
        {(categoryNotice || categoriesError) && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {categoryNotice ?? t("Could not load video categories")}
          </p>
        )}
      </section>

      {filteredVideos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          {videos.length === 0 ? (
            <Film className="mx-auto h-10 w-10 text-muted-foreground" />
          ) : (
            <FolderOpen className="mx-auto h-10 w-10 text-muted-foreground" />
          )}
          <p className="mt-3 text-sm font-medium text-foreground">
            {videos.length === 0 ? t("No videos yet") : t("No videos in this category")}
          </p>
          {videos.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">{t("Upload your first video to get started")}</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredVideos.map((video) => {
            const config = statusConfig[video.status] || statusConfig.ready
            const categoryName = video.category_id ? categoryNames.get(video.category_id) : undefined
            return (
              <Card key={video.id} className="border-border bg-card transition-colors hover:bg-card/80">
                <CardContent className="flex items-center gap-4 p-4">
                  <button
                    type="button"
                    onClick={() => setPreviewVideo(video)}
                    aria-label={`${t("Preview")} ${video.title}`}
                    className="group relative flex h-16 w-28 shrink-0 items-center justify-center rounded-lg bg-secondary transition-colors hover:bg-secondary/80"
                  >
                    <Film className="h-6 w-6 text-muted-foreground transition-opacity group-hover:opacity-0" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/90">
                        <Play className="ml-0.5 h-4 w-4 text-primary-foreground" />
                      </div>
                    </div>
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{video.title}</p>
                        {categoryName && (
                          <Badge variant="secondary" className="mt-2 max-w-full truncate">
                            {categoryName}
                          </Badge>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{formatDuration(video.duration_seconds)}</span>
                          <span className="text-border">|</span>
                          <span>{formatFileSize(video.file_size)}</span>
                          {video.resolution && (
                            <>
                              <span className="text-border">|</span>
                              <span>{video.resolution}</span>
                            </>
                          )}
                          {video.format && (
                            <>
                              <span className="text-border">|</span>
                              <span>{video.format}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline" className={cn("text-xs", config.className)}>
                          {t(config.label)}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                              <MoreVertical className="h-4 w-4" />
                              <span className="sr-only">{t("Video actions")}</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="border-border bg-card">
                            <DropdownMenuItem className="gap-2 text-foreground" onClick={() => setPreviewVideo(video)}>
                              <Play className="h-4 w-4" />
                              {t("Preview")}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2 text-foreground">
                              <Radio className="h-4 w-4" />
                              {t("Stream Now")}
                            </DropdownMenuItem>
                            {canManageCategories && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel>{t("Move to category")}</DropdownMenuLabel>
                                <DropdownMenuItem
                                  className="gap-2 text-foreground"
                                  onClick={() => void handleCategoryChange(video.id, null)}
                                  disabled={Boolean(updatingVideoId) || !video.category_id}
                                >
                                  {t("Uncategorized")}
                                  {!video.category_id && <Check data-icon="inline-end" aria-hidden="true" />}
                                </DropdownMenuItem>
                                {categories.map((category) => (
                                  <DropdownMenuItem
                                    key={category.id}
                                    className="gap-2 text-foreground"
                                    onClick={() => void handleCategoryChange(video.id, category.id)}
                                    disabled={Boolean(updatingVideoId) || video.category_id === category.id}
                                  >
                                    {category.name}
                                    {video.category_id === category.id && <Check data-icon="inline-end" aria-hidden="true" />}
                                  </DropdownMenuItem>
                                ))}
                              </>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="gap-2 text-destructive" onClick={() => handleDelete(video.id)}>
                              <Trash2 className="h-4 w-4" />
                              {t("Delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("Uploaded")} {new Date(video.created_at).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <VideoPreviewDialog
        video={previewVideo}
        open={!!previewVideo}
        onOpenChange={(open) => { if (!open) setPreviewVideo(null) }}
      />
    </div>
  )
}
