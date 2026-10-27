// Connect Pro Fleet — Custom Menu Links settings section.
//
// System → Settings → My Tools. Lets an org owner/admin create, edit, reorder,
// enable/disable, and delete tenant-scoped external tool links with visibility
// controls (all staff / selected roles / selected users) and safe open modes
// (new tab or embedded iframe with fallback for X-Frame-Options/CSP blocking).
// Only https:// URLs are accepted. No passwords or credentials are stored.

import { useState } from "react";
import { useCustomMenuLinks } from "@/lib/store/customMenuLinkStore";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  isSafeUrl,
  type CustomMenuLink,
  type CustomMenuLinkCreateInput,
  type CustomMenuLinkVisibility,
} from "@/lib/customMenuLinkTypes";
import {
  ExternalLink,
  Pencil,
  Trash2,
  Plus,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

const ICON_OPTIONS = [
  "ExternalLink",
  "Satellite",
  "Wallet",
  "CreditCard",
  "Shield",
  "Wrench",
  "Car",
  "MapPin",
  "FileText",
  "Gavel",
  "Receipt",
  "Building2",
  "Link",
  "Calculator",
  "Cloud",
  "Zap",
  "Globe",
  "Truck",
];

export function CustomMenuLinksSection() {
  const {
    links,
    loading,
    createLink,
    updateLink,
    deleteLink,
    toggleLink,
    reorderLink,
  } = useCustomMenuLinks();
  const { staff, roles } = useStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomMenuLink | null>(null);

  const canManage = can(
    roles.find((r) => r.name === "Owner"),
    null,
    "settings.manage_custom_links",
  );

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(link: CustomMenuLink) {
    setEditing(link);
    setDialogOpen(true);
  }

  async function handleDelete(id: string) {
    const ok = await deleteLink(id);
    if (ok) toast.success("Link deleted");
    else toast.error("Failed to delete link");
  }

  async function handleToggle(id: string, enabled: boolean) {
    await toggleLink(id, enabled);
  }

  async function handleMove(id: string, dir: "up" | "down") {
    const idx = links.findIndex((l) => l.id === id);
    if (idx < 0) return;
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= links.length) return;
    const current = links[idx].sort_order;
    const target = links[swapIdx].sort_order;
    await reorderLink(id, target);
    await reorderLink(links[swapIdx].id, current);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-32 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            My Tools & Custom Links
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add external software links to your sidebar. Only secure https://
            URLs are allowed.
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate} size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Add Custom Link
          </Button>
        )}
      </div>

      {links.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Wrench className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-foreground">
            No custom links yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add links to GPS trackers, insurance portals, QuickBooks, Stripe,
            and other tools your team uses.
          </p>
          {canManage && (
            <Button
              onClick={openCreate}
              variant="outline"
              size="sm"
              className="mt-4"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add your first link
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((link, idx) => (
            <div
              key={link.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-4"
            >
              {canManage && (
                <div className="flex flex-col">
                  <button
                    onClick={() => handleMove(link.id, "up")}
                    disabled={idx === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleMove(link.id, "down")}
                    disabled={idx === links.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-foreground">
                    {link.name}
                  </span>
                  {!link.is_enabled && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Disabled
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {link.url}
                </p>
                {link.description && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {link.description}
                  </p>
                )}
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 py-0.5">
                    {link.open_mode === "new_tab" ? "New tab" : "Embedded"}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5">
                    {link.visibility === "all_staff"
                      ? "All staff"
                      : link.visibility === "selected_roles"
                        ? "Selected roles"
                        : "Selected users"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Open"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                {canManage && (
                  <>
                    <Switch
                      checked={link.is_enabled}
                      onCheckedChange={(v) => handleToggle(link.id, v)}
                    />
                    <button
                      onClick={() => openEdit(link)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(link.id)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {dialogOpen && (
        <LinkDialog
          editing={editing}
          onClose={() => setDialogOpen(false)}
          onSave={async (data) => {
            if (editing) {
              const updated = await updateLink(editing.id, data);
              if (updated) toast.success("Link updated");
              else toast.error("Failed to update link");
            } else {
              const created = await createLink(data);
              if (created) toast.success("Link created");
              else toast.error("Failed to create link");
            }
            setDialogOpen(false);
          }}
          roles={roles}
          staff={staff}
        />
      )}
    </div>
  );
}

function LinkDialog({
  editing,
  onClose,
  onSave,
  roles,
  staff,
}: {
  editing: CustomMenuLink | null;
  onClose: () => void;
  onSave: (data: CustomMenuLinkCreateInput) => void;
  roles: { id: string; name: string }[];
  staff: { id: string; full_name: string }[];
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [url, setUrl] = useState(editing?.url ?? "");
  const [icon, setIcon] = useState(editing?.icon ?? "ExternalLink");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [openMode, setOpenMode] = useState(editing?.open_mode ?? "new_tab");
  const [visibility, setVisibility] = useState<CustomMenuLinkVisibility>(
    editing?.visibility ?? "all_staff",
  );
  const [visibleRoleIds, setVisibleRoleIds] = useState<string[]>(
    editing?.visible_role_ids ?? [],
  );
  const [visibleUserIds, setVisibleUserIds] = useState<string[]>(
    editing?.visible_user_ids ?? [],
  );
  const [urlError, setUrlError] = useState("");

  function handleSubmit() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!isSafeUrl(url)) {
      setUrlError("Only valid https:// URLs are allowed");
      return;
    }
    onSave({
      name: name.trim(),
      url: url.trim(),
      icon: icon || null,
      description: description.trim() || null,
      open_mode: openMode,
      sort_order: editing?.sort_order ?? 0,
      is_enabled: editing?.is_enabled ?? true,
      visibility,
      visible_role_ids: visibility === "selected_roles" ? visibleRoleIds : [],
      visible_user_ids: visibility === "selected_users" ? visibleUserIds : [],
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit Custom Link" : "Add Custom Link"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="cml-name">Link Name</Label>
            <Input
              id="cml-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="GPS Tracker"
            />
          </div>
          <div>
            <Label htmlFor="cml-url">URL</Label>
            <Input
              id="cml-url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setUrlError("");
              }}
              placeholder="https://tracker.example.com"
            />
            {urlError && (
              <p className="mt-1 text-xs text-destructive">{urlError}</p>
            )}
          </div>
          <div>
            <Label htmlFor="cml-desc">Description (optional)</Label>
            <Textarea
              id="cml-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Short description shown in settings"
            />
          </div>
          <div>
            <Label>Icon</Label>
            <Select value={icon} onValueChange={setIcon}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ICON_OPTIONS.map((ic) => (
                  <SelectItem key={ic} value={ic}>
                    {ic}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Open Behavior</Label>
            <Select
              value={openMode}
              onValueChange={(v) => setOpenMode(v as "new_tab" | "embedded")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new_tab">Open in new tab</SelectItem>
                <SelectItem value="embedded">Open inside Fleet OS</SelectItem>
              </SelectContent>
            </Select>
            {openMode === "embedded" && (
              <p className="mt-1 text-xs text-muted-foreground">
                Some websites block embedded viewing. A fallback message with an
                "Open in New Tab" button will be shown if embedding fails.
              </p>
            )}
          </div>
          <div>
            <Label>Visible To</Label>
            <Select
              value={visibility}
              onValueChange={(v) =>
                setVisibility(v as CustomMenuLinkVisibility)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_staff">All Staff</SelectItem>
                <SelectItem value="selected_roles">Selected Roles</SelectItem>
                <SelectItem value="selected_users">Selected Users</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {visibility === "selected_roles" && (
            <div>
              <Label>Roles</Label>
              <div className="space-y-2 rounded-lg border border-border p-3">
                {roles.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={visibleRoleIds.includes(r.id)}
                      onChange={(e) => {
                        setVisibleRoleIds((prev) =>
                          e.target.checked
                            ? [...prev, r.id]
                            : prev.filter((id) => id !== r.id),
                        );
                      }}
                    />
                    {r.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          {visibility === "selected_users" && (
            <div>
              <Label>Users</Label>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
                {staff.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={visibleUserIds.includes(s.id)}
                      onChange={(e) => {
                        setVisibleUserIds((prev) =>
                          e.target.checked
                            ? [...prev, s.id]
                            : prev.filter((id) => id !== s.id),
                        );
                      }}
                    />
                    {s.full_name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>
            {editing ? "Save Changes" : "Create Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
