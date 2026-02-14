"use client"

import { TopHeader } from "@/components/top-header"
import { OverlayManager } from "@/components/overlays/overlay-manager"

export default function OverlaysPage() {
  return (
    <div className="flex flex-col">
      <TopHeader title="Overlays" />
      <div className="flex-1 space-y-6 p-6">
        <OverlayManager />
      </div>
    </div>
  )
}
