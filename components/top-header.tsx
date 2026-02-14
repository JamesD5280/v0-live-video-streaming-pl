"use client"

import { Bell, Search, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"

export function TopHeader({ title }: { title: string }) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-border px-6">
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className="w-64 bg-secondary pl-9 text-sm"
          />
        </div>
        <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-live" />
          <span className="sr-only">Notifications</span>
        </Button>
        <Link href="/streams">
          <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" />
            New Stream
          </Button>
        </Link>
      </div>
    </header>
  )
}
