// Connect Pro Fleet — Roles & Permissions section (Build #24).
// Role list, role builder (collapsible permission groups), presets, duplicate,
// archive, permission preview. Uses existing permission catalog — no second
// authorization system.

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useCan } from "@/pages/settings/useCan";
import { PERMISSION_CATALOG, PERMISSION_MODULES } from "@/lib/permissions";
import { permissionsForModule } from "@/lib/permissions";
import { ROLE_PRESETS } from "@/lib/staffTypes";
import type { Role } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Copy, Archive, Plus, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function RolesSection() {
  const store = useStore();
  const canManage = useCan("staff.manage_roles");
  const [editing, setEditing] = useState<Role | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const staffCountForRole = (roleId: string) =>
    store.staff.filter((s) => s.role_id === roleId).length;

  /** Compact per-module access summary: module name + Access/No access. */
  const accessSummary = (role: Role) => {
    const enabled = PERMISSION_MODULES.filter((mod) =>
      PERMISSION_CATALOG.filter((p) => p.module === mod).some(
        (p) => role.permissions[p.key],
      ),
    );
    return PERMISSION_MODULES.map((mod) => ({
      module: mod,
      has: enabled.includes(mod),
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {store.roles.length} roles ·{" "}
          {store.roles.filter((r) => r.is_system).length} system
        </p>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> New Role
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {store.roles.map((r) => (
          <div
            key={r.id}
            className="rounded-lg border border-border bg-surface p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground">{r.name}</p>
                  {r.is_system && (
                    <Badge variant="outline" className="text-[10px]">
                      system
                    </Badge>
                  )}
                  {r.is_protected && (
                    <Badge variant="outline" className="text-[10px]">
                      protected
                    </Badge>
                  )}
                  {!r.active && (
                    <Badge variant="outline" className="text-[10px]">
                      archived
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.description}
                </p>
              </div>
            </div>
            {/* Compact per-module access summary (Access / No access). */}
            <div className="mt-3 flex flex-wrap gap-1">
              {accessSummary(r).map((a) => (
                <span
                  key={a.module}
                  className={
                    "rounded px-1.5 py-0.5 text-[10px] " +
                    (a.has
                      ? "bg-status-maintenance/10 text-status-maintenance"
                      : "bg-surface-2 text-muted-foreground")
                  }
                >
                  {a.module}
                </span>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {staffCountForRole(r.id)} staff ·{" "}
                {Object.values(r.permissions).filter(Boolean).length}{" "}
                permissions
              </span>
              <div className="flex gap-1.5">
                {canManage && (
                  <>
                    <button
                      onClick={() => setEditing(r)}
                      className="text-xs text-primary hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        const id = store.duplicateRole(r.id);
                        if (id) toast.success(`Duplicated "${r.name}".`);
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Copy size={13} className="inline" /> Duplicate
                    </button>
                    {!r.is_system && r.active && (
                      <button
                        onClick={() => {
                          if (staffCountForRole(r.id) > 0) {
                            toast.error(
                              "Cannot archive a role in use. Reassign staff first.",
                            );
                            return;
                          }
                          store.updateRole(r.id, { active: false });
                          store.logSettingsChange({
                            action: "Role archived",
                            new_value: r.name,
                          });
                          toast.success(`Archived "${r.name}".`);
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Archive size={13} className="inline" /> Archive
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && canManage && (
        <RoleBuilder role={editing} onClose={() => setEditing(null)} />
      )}

      {createOpen && canManage && (
        <CreateRoleDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={setEditing}
        />
      )}
    </div>
  );
}

function CreateRoleDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (r: Role) => void;
}) {
  const store = useStore();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [presetId, setPresetId] = useState<string>("blank");

  function create() {
    if (!name.trim()) return;
    const allFalse: Record<string, boolean> = {};
    for (const p of PERMISSION_CATALOG) allFalse[p.key] = false;
    const preset = ROLE_PRESETS.find((p) => p.id === presetId);
    if (preset) for (const k of preset.permissions) allFalse[k] = true;
    const id = `role_${Date.now()}`;
    const role: Role = {
      id,
      tenant_id: store.tenant.id,
      name: name.trim(),
      description: (description.trim() || preset?.description) ?? "",
      is_system: false,
      is_protected: false,
      active: true,
      permissions: allFalse,
      created_at: new Date().toISOString(),
    };
    store.addRole(role);
    store.logSettingsChange({ action: "Role created", new_value: role.name });
    onOpenChange(false);
    setName("");
    setDescription("");
    setPresetId("blank");
    onCreated(role);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Role</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. CSR Supervisor"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Description
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Start from preset
            </label>
            <select
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="blank">Blank (no permissions)</option>
              {ROLE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={create} disabled={!name.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoleBuilder({ role, onClose }: { role: Role; onClose: () => void }) {
  const store = useStore();
  const [perms, setPerms] = useState<Record<string, boolean>>({
    ...role.permissions,
  });
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description);

  const enabledCount = Object.values(perms).filter(Boolean).length;
  const enabledModules = Array.from(
    new Set(
      PERMISSION_CATALOG.filter((p) => perms[p.key]).map((p) => p.module),
    ),
  );

  function toggle(key: string) {
    setPerms((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function save() {
    store.updateRole(role.id, {
      name: name.trim(),
      description: description.trim(),
      permissions: perms,
    });
    store.logSettingsChange({
      action: "Role permissions changed",
      detail: `${name.trim()}: ${enabledCount} permissions enabled`,
    });
    toast.success(`Saved "${name.trim()}".`);
    onClose();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Role</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={role.is_protected}
                className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Description
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Permission preview */}
          <div className="rounded-md border border-border bg-surface-2 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              This role can access {enabledModules.length} areas ·{" "}
              {enabledCount} permissions
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {enabledModules.map((m) => (
                <Badge key={m} variant="outline" className="text-[10px]">
                  {m}
                </Badge>
              ))}
              {enabledModules.length === 0 && (
                <span className="text-xs text-muted-foreground">No access</span>
              )}
            </div>
          </div>

          {/* Collapsible permission groups */}
          <div className="space-y-1">
            {PERMISSION_MODULES.map((module) => {
              const modulePerms = permissionsForModule(module);
              const enabledInModule = modulePerms.filter(
                (p) => perms[p.key],
              ).length;
              return (
                <Collapsible key={module}>
                  <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium hover:bg-surface-2">
                    <span>{module}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {enabledInModule}/{modulePerms.length} enabled
                      <ChevronDown size={14} />
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-3 pb-2">
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {modulePerms.map((p) => (
                        <label
                          key={p.key}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs",
                            perms[p.key] ? "bg-primary/5" : "",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={!!perms[p.key]}
                            onChange={() => toggle(p.key)}
                            className="h-3.5 w-3.5"
                          />
                          <span className="text-foreground">{p.label}</span>
                        </label>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save Role</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
