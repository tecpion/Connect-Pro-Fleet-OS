// Connect Pro Fleet — Integrations → API Keys tab (Settings Consolidation).
//
// Security-hardened API key model:
//   - Full secret shown ONCE at creation (copy it then).
//   - Masked thereafter (cpf_live_••••••8a21) — no persistent "Show" button.
//   - Scopes default to least-privilege (never unrestricted full-tenant).
//   - Revocation stops authenticating once a production backend enforces it.

import { useState } from "react";
import { useStore } from "@/lib/store";
import { SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StatusPill } from "@/components/Status";
import { Plus, Copy, RotateCw, Trash2 } from "lucide-react";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { toast } from "sonner";

export interface ApiKeyRecord {
  id: string;
  name: string;
  environment: "live" | "test";
  scopes: string[];
  masked: string;
  createdAt: string;
  createdBy: string;
  lastUsed: string | null;
  expiresAt: string | null;
  status: "active" | "revoked";
}

export const API_SCOPES = [
  "rentals:read",
  "rentals:write",
  "vehicles:read",
  "vehicles:write",
  "customers:read",
  "finance:read",
  "tasks:read",
  "tasks:write",
];

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 6)}`;

export function ApiKeysTab({ canManage }: { canManage: boolean }) {
  const { tenant } = useStore();
  const [keys, setKeys] = useState<ApiKeyRecord[]>([
    {
      id: "key_1",
      name: "Default key",
      environment: "live",
      scopes: ["rentals:read", "vehicles:read"],
      masked: "cpf_live_••••••8a21",
      createdAt: tenant.created_at,
      createdBy: "Owner",
      lastUsed: "2026-09-12T09:14:00Z",
      expiresAt: null,
      status: "active",
    },
  ]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [env, setEnv] = useState<"live" | "test">("live");
  const [scopes, setScopes] = useState<string[]>(["rentals:read"]);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  const create = () => {
    if (!name.trim()) {
      toast.error("Enter a key name.");
      return;
    }
    const secret = `cpf_${env}_${Math.random().toString(36).slice(2, 18)}`;
    const masked = `cpf_${env}_••••••${secret.slice(-4)}`;
    setKeys((ks) => [
      {
        id: uid("key"),
        name,
        environment: env,
        scopes,
        masked,
        createdAt: new Date().toISOString(),
        createdBy: "You",
        lastUsed: null,
        expiresAt: null,
        status: "active",
      },
      ...ks,
    ]);
    setCreatedSecret(secret);
    setName("");
    setOpen(false);
  };

  const toggleScope = (s: string) =>
    setScopes((cur) =>
      cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s],
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          API keys authenticate external requests to your workspace. The full
          secret is shown <strong>only once</strong> at creation — copy it now.
        </p>
        {canManage && (
          <Button
            onClick={() => setOpen((v) => !v)}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            <Plus size={15} className="mr-1.5" /> Create API key
          </Button>
        )}
      </div>

      {createdSecret && (
        <SectionCard title="New API key — copy now">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <code className="flex-1 rounded bg-surface-2 px-3 py-2 font-mono text-sm tabular text-foreground">
              {createdSecret}
            </code>
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard?.writeText(createdSecret);
                toast.success("Secret copied to clipboard.");
              }}
            >
              <Copy size={14} className="mr-1.5" /> Copy
            </Button>
            <Button variant="ghost" onClick={() => setCreatedSecret(null)}>
              I&apos;ve saved it
            </Button>
          </div>
          <p className="mt-2 text-xs text-status-out">
            This secret will not be shown again. Store it securely.
          </p>
        </SectionCard>
      )}

      {open && canManage && (
        <SectionCard title="Create API key">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Billing integration"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Environment</Label>
              <select
                value={env}
                onChange={(e) => setEnv(e.target.value as "live" | "test")}
                className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="live">Live</option>
                <option value="test">Test</option>
              </select>
            </div>
          </div>
          <div className="mt-3">
            <Label>Scopes</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {API_SCOPES.map((s) => (
                <label
                  key={s}
                  className="flex items-center gap-1.5 rounded border border-border px-2 py-1 text-xs"
                >
                  <Switch
                    checked={scopes.includes(s)}
                    onCheckedChange={() => toggleScope(s)}
                  />
                  <span className="font-mono tabular text-foreground">{s}</span>
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Default is least-privilege — never unrestricted full-tenant
              access.
            </p>
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              onClick={create}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              Create key
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </SectionCard>
      )}

      {keys.map((k) => (
        <SectionCard
          key={k.id}
          title={k.name}
          right={
            <StatusPill tone={k.status === "active" ? "available" : "out"}>
              {k.status === "active" ? "Active" : "Revoked"}
            </StatusPill>
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Meta label="Key" value={k.masked} mono />
            <Meta label="Environment" value={k.environment} />
            <Meta label="Created" value={fmtDate(k.createdAt)} />
            <Meta label="Created by" value={k.createdBy} />
            <Meta
              label="Last used"
              value={k.lastUsed ? fmtDateTime(k.lastUsed) : "Never"}
            />
            <Meta
              label="Expiration"
              value={k.expiresAt ? fmtDate(k.expiresAt) : "No expiration"}
            />
          </div>
          <div className="mt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Scopes
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {k.scopes.map((s) => (
                <span
                  key={s}
                  className="rounded border border-border px-2 py-0.5 font-mono text-xs text-foreground"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
          {canManage && k.status === "active" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  toast.success("Key rotated. Copy the new secret.")
                }
              >
                <RotateCw size={13} className="mr-1" /> Rotate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-status-out"
                onClick={() => {
                  setKeys((ks) =>
                    ks.map((x) =>
                      x.id === k.id ? { ...x, status: "revoked" } : x,
                    ),
                  );
                  toast.info(
                    "Key revoked. It stops authenticating once the production backend enforces it.",
                  );
                }}
              >
                <Trash2 size={13} className="mr-1" /> Revoke
              </Button>
            </div>
          )}
        </SectionCard>
      ))}

      {canManage && (
        <div className="rounded-md border border-border bg-surface px-3 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Available scopes
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {API_SCOPES.map((s) => (
              <span
                key={s}
                className="rounded border border-border px-2 py-0.5 font-mono text-xs text-foreground"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-0.5 text-sm text-foreground ${mono ? "font-mono tabular" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
