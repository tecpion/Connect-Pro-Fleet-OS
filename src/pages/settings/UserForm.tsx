import { useState } from "react";
import { useStore, uid, TENANT_ID } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  PERMISSION_MODULES,
  permissionsForModule,
  SYSTEM_ROLE_PERMISSIONS,
} from "@/lib/permissions";
import type { DisplayRole, Staff } from "@/lib/types";
import { Field, selectClass } from "./shared";

export function UserForm({ onSubmit }: { onSubmit: (s: Staff) => void }) {
  const { roles, locations } = useStore();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [displayRole, setDisplayRole] = useState<DisplayRole>("user");
  const [customRoleName, setCustomRoleName] = useState("");
  const [locIds, setLocIds] = useState<string[]>([]);

  const roleOptions: DisplayRole[] = [
    "owner",
    "manager",
    "user",
    "partner",
    "custom",
  ];

  const submit = () => {
    if (!first.trim() || !email.trim()) {
      toast.error("First name and email are required.");
      return;
    }
    let roleId = "";
    let staffRole: Staff["role"] = "staff";
    if (displayRole === "owner") {
      roleId = "role_owner";
      staffRole = "owner";
    } else if (displayRole === "manager") {
      roleId = "role_manager";
      staffRole = "manager";
    } else if (displayRole === "user") {
      roleId = "role_user";
      staffRole = "staff";
    } else if (displayRole === "partner") {
      roleId = "role_partner";
      staffRole = "agent";
    } else {
      const existing = roles.find(
        (r) =>
          r.name.toLowerCase() === customRoleName.trim().toLowerCase() &&
          !r.is_system,
      );
      roleId = existing ? existing.id : uid("role");
      staffRole = "custom";
    }
    const s: Staff = {
      id: uid("stf"),
      tenant_id: TENANT_ID,
      full_name: `${first} ${last}`.trim(),
      email,
      role: staffRole,
      permission_overrides: null,
      created_at: new Date().toISOString(),
      phone: phone || null,
      display_role: displayRole,
      role_id: roleId,
      location_ids: locIds,
      status: "invited",
      last_activity_at: null,
      theme: "light",
    };
    onSubmit(s);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name">
          <Input value={first} onChange={(e) => setFirst(e.target.value)} />
        </Field>
        <Field label="Last name">
          <Input value={last} onChange={(e) => setLast(e.target.value)} />
        </Field>
      </div>
      <Field label="Email">
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="font-mono tabular"
        />
      </Field>
      <Field label="Phone number">
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="font-mono tabular"
        />
      </Field>
      <Field label="Role">
        <select
          value={displayRole}
          onChange={(e) => setDisplayRole(e.target.value as DisplayRole)}
          className={selectClass}
        >
          {roleOptions.map((r) => (
            <option key={r} value={r} className="capitalize">
              {r}
            </option>
          ))}
        </select>
      </Field>
      {displayRole === "custom" && (
        <Field
          label="Custom role name"
          hint="Creates a new role you can configure under Roles."
        >
          <Input
            value={customRoleName}
            onChange={(e) => setCustomRoleName(e.target.value)}
            placeholder="e.g. Fleet Manager, Dispatcher, Tickets Coordinator"
          />
        </Field>
      )}
      <Field label="Location access" hint="Leave empty for all locations.">
        <div className="space-y-2">
          {locations.map((loc) => (
            <label
              key={loc.id}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
            >
              <Checkbox
                checked={locIds.includes(loc.id)}
                onCheckedChange={(v) =>
                  setLocIds((ids) =>
                    v ? [...ids, loc.id] : ids.filter((x) => x !== loc.id),
                  )
                }
              />
              <span className="text-sm text-foreground">{loc.name}</span>
            </label>
          ))}
        </div>
      </Field>
      <DialogFooter>
        <Button
          onClick={submit}
          className="bg-primary text-primary-foreground hover:bg-primary-press"
        >
          Send invite
        </Button>
      </DialogFooter>
    </div>
  );
}

export function UserDetail({
  user,
  onOverride,
  onClear,
}: {
  user: Staff;
  onOverride: (key: string, value: boolean) => void;
  onClear: (key: string) => void;
}) {
  const { roles } = useStore();
  const role = roles.find((r) => r.id === user.role_id);
  const perms = role
    ? { ...role.permissions }
    : { ...SYSTEM_ROLE_PERMISSIONS.user };
  const overrides =
    (user.permission_overrides as Record<string, boolean>) ?? {};
  for (const [k, v] of Object.entries(overrides)) {
    if (typeof v === "boolean") perms[k] = v;
  }

  const fmtDateShort = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Email
          </p>
          <p className="font-mono tabular text-foreground">{user.email}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Phone
          </p>
          <p className="font-mono tabular text-foreground">
            {user.phone ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Role
          </p>
          <p className="text-foreground">{role?.name ?? user.display_role}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Status
          </p>
          <p className="capitalize text-foreground">{user.status}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Date added
          </p>
          <p className="font-mono tabular text-foreground">
            {fmtDateShort(user.created_at)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Last activity
          </p>
          <p className="font-mono tabular text-foreground">
            {user.last_activity_at ? fmtDateShort(user.last_activity_at) : "—"}
          </p>
        </div>
      </div>

      <div className="rounded-md border border-border">
        <div className="border-b border-border px-4 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Permissions — inherited from role, with per-user overrides
          </p>
        </div>
        <div className="max-h-[44vh] overflow-y-auto">
          {PERMISSION_MODULES.map((mod) => (
            <div key={mod} className="border-b border-border last:border-0">
              <p className="bg-surface-2 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {mod}
              </p>
              <div className="divide-y divide-border">
                {permissionsForModule(mod).map((perm) => {
                  const overridden = perm.key in overrides;
                  return (
                    <label
                      key={perm.key}
                      className="flex items-center justify-between px-4 py-2.5"
                    >
                      <span className="text-sm text-foreground">
                        {perm.label}
                        {overridden && (
                          <span className="ml-2 text-xs text-status-maintenance">
                            override
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        {overridden && (
                          <button
                            onClick={() => onClear(perm.key)}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            reset
                          </button>
                        )}
                        <Switch
                          checked={!!perms[perm.key]}
                          onCheckedChange={(v) => onOverride(perm.key, v)}
                        />
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
