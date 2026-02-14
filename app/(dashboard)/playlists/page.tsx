"use client"

import { TopHeader } from "@/components/top-header"
import { PlaylistManager } from "@/components/playlists/playlist-manager"

export default function PlaylistsPage() {
  return (
    <div className="flex flex-col">
      <TopHeader title="Playlists" />
      <div className="flex-1 space-y-6 p-6">
        <PlaylistManager />
      </div>
    </div>
  )
}
