"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import TagList from "./TagList"
import PullCommand from "./PullCommand"
import type { TagRowData, PermissionRow } from "@/lib/repository-page-data"
import type { RepositoryOverviewResult } from "@/lib/repository-overview"
import { Shield, Trash2, UserPlus, Pencil, FileText } from "lucide-react"
import { toast } from "sonner"
import { PromptDialog } from "@/components/ui/prompt-dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"

type Visibility = "public" | "private"

interface Props {
  name: string
  registryHost: string
  repositoryUrlPath: string
  overview: RepositoryOverviewResult
  overviewMarkdown: string | null
  initialTagRows: TagRowData[]
  initialRepoVisibility: Visibility
  isGlobalAdmin: boolean
  canManagePermissions: boolean
  initialPermissions: PermissionRow[]
}

function apiRepoPath(urlPath: string) {
  return "/api/repositories/" + encodeURIComponent(urlPath)
}

export default function RepositoryHubView({
  name,
  registryHost,
  repositoryUrlPath,
  overview: initialOverview,
  overviewMarkdown: initialMd,
  initialTagRows,
  initialRepoVisibility,
  isGlobalAdmin,
  canManagePermissions,
  initialPermissions,
}: Props) {
  const [repoVisibility, setRepoVisibility] = useState<Visibility>(initialRepoVisibility)
  const [overview] = useState(initialOverview)
  const tagCount = initialTagRows.length
  const permissions = initialPermissions
  const [editOpen, setEditOpen] = useState(false)
  const [editText, setEditText] = useState(initialMd ?? "")
  const [saving, setSaving] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)
  const [promptTitle, setPromptTitle] = useState("")
  const [promptDefault, setPromptDefault] = useState("")
  const [promptPlaceholder, setPromptPlaceholder] = useState("")
  const [promptResolve, setPromptResolve] = useState<(value: string) => void>(() => () => {})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmMessage, setConfirmMessage] = useState("")
  const [confirmResolve, setConfirmResolve] = useState<(value: boolean) => void>(() => () => {})

  function showPrompt(title: string, defaultValue = "", placeholder = ""): Promise<string> {
    return new Promise((resolve) => {
      setPromptTitle(title)
      setPromptDefault(defaultValue)
      setPromptPlaceholder(placeholder)
      setPromptResolve(() => resolve)
      setPromptOpen(true)
    })
  }

  function showConfirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      setConfirmMessage(message)
      setConfirmResolve(() => resolve)
      setConfirmOpen(true)
    })
  }

  const pull = `docker pull ${registryHost}/${name}`

  const setVisibility = async (visibility: Visibility) => {
    try {
      const res = await fetch(apiRepoPath(repositoryUrlPath) + "/visibility", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || "Failed to update visibility")
      }
      setRepoVisibility(visibility)
      toast.success(visibility === "public" ? "Repository is public in the catalog" : "Repository is private in the catalog")
      setTimeout(() => window.location.reload(), 1500)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error")
    }
  }

  const saveOverview = async (markdown: string | null) => {
    setSaving(true)
    try {
      const res = await fetch(apiRepoPath(repositoryUrlPath) + "/overview", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overviewMarkdown: markdown }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || "Failed to save overview")
      }
      toast.success("Overview saved")
      setEditOpen(false)
      window.location.reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold font-mono tracking-tight">{name}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {tagCount} tag{tagCount === 1 ? "" : "s"}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant={repoVisibility === "public" ? "secondary" : "outline"}>
            {repoVisibility === "public" ? "Public catalog" : "Private catalog"}
          </Badge>
          {canManagePermissions && (
            <div className="flex flex-wrap gap-2">
              {repoVisibility !== "public" && (
                <Button variant="outline" size="sm" type="button" onClick={() => setVisibility("public")}>
                  Make public
                </Button>
              )}
              {repoVisibility !== "private" && (
                <Button variant="outline" size="sm" type="button" onClick={() => setVisibility("private")}>
                  Make private
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full max-w-4xl">
        <TabsList
          className="w-full justify-start sm:w-auto"
          variant="line"
        >
          <TabsTrigger value="overview" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
          {canManagePermissions && <TabsTrigger value="settings">Settings</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Pull</p>
            <PullCommand command={pull} />
          </div>

          {canManagePermissions && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => {
                  setEditText(initialMd ?? "")
                  setEditOpen(true)
                }}
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit overview
              </Button>
              {initialMd != null && initialMd !== "" && (
                <Button variant="ghost" size="sm" type="button" onClick={() => saveOverview(null)}>
                  Remove custom overview
                </Button>
              )}
            </div>
          )}

          {overview.source === "empty" && (
            <p className="text-sm text-muted-foreground rounded-md border border-dashed p-6">
              No overview yet. Admins can add a custom README here, or add OCI labels to your image (e.g.{" "}
              <code className="text-xs">org.opencontainers.image.description</code>) and re-sync the repository.
            </p>
          )}

          {overview.html.length > 0 && (
            <div
              className="repository-overview-prose min-h-32 max-w-3xl rounded-md border border-border/60 bg-card/30 p-4 text-sm"
              // eslint-disable-next-line react/no-danger -- sanitized on server
              dangerouslySetInnerHTML={{ __html: overview.html }}
            />
          )}

          <p className="text-xs text-muted-foreground">
            {overview.source === "db" && "Showing custom repository overview (markdown)."}
            {overview.source === "labels" && "Showing metadata from OCI image labels (from the preferred tag’s config)."}
            {overview.source === "empty" && ""}
          </p>
        </TabsContent>

        <TabsContent value="tags" className="mt-4">
          <TagList name={name} tags={initialTagRows} registryHost={registryHost} isAdmin={isGlobalAdmin} />
        </TabsContent>

        {canManagePermissions && (
          <TabsContent value="settings" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Shield className="h-4 w-4" />
                    Granular permissions
                  </CardTitle>
                  <CardDescription>Direct user access to this repository</CardDescription>
                </div>
                  <Button
                    size="sm"
                    type="button"
                    onClick={async () => {
                      const username = await showPrompt("Enter username:")
                      if (!username) return
                      const permission = await showPrompt("Enter permission (pull, push, admin):", "pull")
                      if (!permission) return
                      try {
                        const res = await fetch(apiRepoPath(repositoryUrlPath) + "/permissions", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ username, permission }),
                        })
                        if (!res.ok) {
                          const err = await res.json()
                          throw new Error(err.error || "Failed")
                        }
                        toast.success("Permission added")
                        window.location.reload()
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Error")
                      }
                    }}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add user
                  </Button>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col divide-y rounded-md border">
                  {permissions.length === 0 ? (
                    <p className="py-4 text-sm text-muted-foreground text-center">No granular permissions set.</p>
                  ) : (
                    permissions.map((p) => (
                      <div key={p.userId} className="flex items-center justify-between py-3 px-3">
                        <span className="text-sm font-medium">{p.username}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs uppercase px-2 py-0.5 rounded-full bg-muted border font-medium">
                            {p.permission}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            type="button"
                            onClick={async () => {
                              const confirmed = await showConfirm("Remove this permission?")
                              if (!confirmed) return
                              try {
                                const res = await fetch(
                                  apiRepoPath(repositoryUrlPath) + "/permissions?userId=" + encodeURIComponent(p.userId),
                                  { method: "DELETE" },
                                )
                                if (!res.ok) throw new Error("Failed to remove")
                                toast.success("Permission removed")
                                window.location.reload()
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : "Error")
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Repository overview (markdown)</DialogTitle>
          </DialogHeader>
          <Textarea
            className="min-h-[240px] font-mono text-sm"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            placeholder="## My image&#10;Describe what it does…"
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => saveOverview(editText.trim() ? editText : null)}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PromptDialog
        open={promptOpen}
        onOpenChange={setPromptOpen}
        title={promptTitle}
        defaultValue={promptDefault}
        placeholder={promptPlaceholder}
        onSubmit={(value) => {
          setPromptOpen(false)
          promptResolve(value)
        }}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>{confirmMessage}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false)
                confirmResolve(true)
              }}
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
