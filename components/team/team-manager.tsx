"use client"

import { useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { fetcher } from "@/lib/fetcher"
import {
  Users,
  UserPlus,
  Mail,
  Loader2,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  Copy,
  Shield,
  Pencil,
  Eye,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface TeamMember {
  id: string
  display_name: string | null
  email: string | null
  role: string
  created_at: string
}

interface Invitation {
  id: string
  email: string
  role: string
  status: string
  token: string
  created_at: string
  expires_at: string
  accepted_at: string | null
}

const roleConfig: Record<string, { label: string; icon: typeof Shield; color: string; description: string }> = {
  admin: {
    label: "Admin",
    icon: Shield,
    color: "text-primary border-primary/30 bg-primary/10",
    description: "Full access: manage streams, overlays, videos, settings, and team",
  },
  editor: {
    label: "Editor",
    icon: Pencil,
    color: "text-amber-400 border-amber-400/30 bg-amber-400/10",
    description: "Can manage streams, overlays, and videos",
  },
  viewer: {
    label: "Viewer",
    icon: Eye,
    color: "text-muted-foreground border-border bg-muted",
    description: "Can view streams and schedule but cannot make changes",
  },
}

export function TeamManager() {
  const { data: team, error: teamError, mutate: mutateTeam } = useSWR<TeamMember[]>("/api/team", fetcher)
  const { data: invitations, mutate: mutateInvites } = useSWR<Invitation[]>("/api/invitations", fetcher)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("editor")
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [changingRole, setChangingRole] = useState<string | null>(null)
  const [removingUser, setRemovingUser] = useState<string | null>(null)

  const handleInvite = async () => {
    setInviting(true)
    setInviteError(null)
    setInviteSuccess(false)
    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      const data = await res.json()
      if (!res.ok) {
        setInviteError(data.error || "Failed to send invitation")
      } else {
        setInviteSuccess(true)
        setInviteEmail("")
        mutateInvites()
        setTimeout(() => {
          setInviteOpen(false)
          setInviteSuccess(false)
        }, 1500)
      }
    } catch {
      setInviteError("Failed to send invitation")
    }
    setInviting(false)
  }

  const handleRevoke = async (id: string) => {
    await fetch(`/api/invitations?id=${id}`, { method: "DELETE" })
    mutateInvites()
  }

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/invite/${token}`
    navigator.clipboard.writeText(link)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  const handleRoleChange = async (userId: string, newRole: string) => {
    setChangingRole(userId)
    try {
      const res = await fetch("/api/team", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      })
      if (res.ok) {
        mutateTeam()
      }
    } catch {
      console.error("Failed to change role")
    }
    setChangingRole(null)
  }

  const handleRemoveUser = async (userId: string) => {
    if (!confirm("Are you sure you want to remove this user? This action cannot be undone.")) {
      return
    }
    setRemovingUser(userId)
    try {
      const res = await fetch(`/api/team?id=${userId}`, { method: "DELETE" })
      if (res.ok) {
        mutateTeam()
      }
    } catch {
      console.error("Failed to remove user")
    }
    setRemovingUser(null)
  }

  const pendingInvitations = invitations?.filter((i) => i.status === "pending") || []
  const pastInvitations = invitations?.filter((i) => i.status !== "pending") || []

  return (
    <div className="space-y-6">
      {/* Team Members */}
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Users className="h-4 w-4" />
            Team Members
          </CardTitle>
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <UserPlus className="h-3.5 w-3.5" />
                Invite User
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">Invite a Team Member</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label className="text-foreground">Email Address</Label>
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    className="bg-secondary border-border text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Role</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger className="bg-secondary border-border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {Object.entries(roleConfig).map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <config.icon className="h-3.5 w-3.5" />
                            {config.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {roleConfig[inviteRole]?.description}
                  </p>
                </div>

                {inviteError && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
                    {inviteError}
                  </div>
                )}
                {inviteSuccess && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs text-primary flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Invitation created! Share the link with the user.
                  </div>
                )}

                <Button
                  onClick={handleInvite}
                  disabled={!inviteEmail.trim() || inviting}
                  className="w-full gap-2"
                >
                  {inviting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  {inviting ? "Creating Invitation..." : "Create Invitation"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {teamError ? (
            <p className="text-sm text-muted-foreground">Failed to load team members.</p>
          ) : !team ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              {team.map((member) => {
                const role = roleConfig[member.role] || roleConfig.viewer
                const RoleIcon = role.icon
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
                        {(member.display_name || member.email || "?").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {member.display_name || "Unnamed User"}
                        </p>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={member.role}
                        onValueChange={(newRole) => handleRoleChange(member.id, newRole)}
                        disabled={changingRole === member.id}
                      >
                        <SelectTrigger className={cn("w-28 h-8 text-xs", role.color)}>
                          {changingRole === member.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <SelectValue />
                          )}
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          {Object.entries(roleConfig).map(([key, config]) => (
                            <SelectItem key={key} value={key}>
                              <div className="flex items-center gap-2">
                                <config.icon className="h-3 w-3" />
                                {config.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveUser(member.id)}
                        disabled={removingUser === member.id}
                      >
                        {removingUser === member.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                )
              })}
              {team.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No team members yet. Invite someone to get started.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Clock className="h-4 w-4" />
              Pending Invitations ({pendingInvitations.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingInvitations.map((invite) => {
              const role = roleConfig[invite.role] || roleConfig.viewer
              const isExpired = new Date(invite.expires_at) < new Date()
              return (
                <div
                  key={invite.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Mail className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{invite.email}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", role.color)}>
                          {role.label}
                        </Badge>
                        <span>{isExpired ? "Expired" : `Expires ${new Date(invite.expires_at).toLocaleDateString()}`}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={() => copyInviteLink(invite.token)}
                    >
                      <Copy className="h-3 w-3" />
                      {copiedToken === invite.token ? "Copied!" : "Copy Link"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleRevoke(invite.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Past Invitations */}
      {pastInvitations.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">
              Invitation History
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pastInvitations.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-3 opacity-70"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    {invite.status === "accepted" ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{invite.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {invite.status === "accepted"
                        ? `Accepted ${invite.accepted_at ? new Date(invite.accepted_at).toLocaleDateString() : ""}`
                        : `${invite.status.charAt(0).toUpperCase() + invite.status.slice(1)}`}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    invite.status === "accepted"
                      ? "text-primary border-primary/30 bg-primary/10"
                      : "text-destructive border-destructive/30 bg-destructive/10"
                  )}
                >
                  {invite.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
