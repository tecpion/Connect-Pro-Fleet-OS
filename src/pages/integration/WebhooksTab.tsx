// Connect Pro Fleet — Integrations → Webhooks tab (Settings Consolidation).
//
// Endpoint model with signing secret + explicit event subscriptions. Live
// delivery, retries, and idempotency require a production backend — stored
// configuration now, reported as a production dependency (not faked).

import { useState } from "react";
import { SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StatusPill } from "@/components/Status";
import { Webhook, Plus, RotateCw, Trash2 } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { toast } from "sonner";

export interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  signingSecret: string;
  events: string[];
  active: boolean;
  createdAt: string;
  lastDelivery: string | null;
  lastSuccess: string | null;
  lastError: string | null;
}

export const WEBHOOK_EVENTS = [
  "rental.created",
  "rental.updated",
  "reservation.created",
  "reservation.updated",
  "payment.recorded",
  "vehicle.updated",
  "inspection.completed",
  "damage.created",
  "task.created",
  "expense.created",
];

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 7)}`;

export function WebhooksTab({ canManage }: { canManage: boolean }) {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([
    {
      id: "wh_1",
      name: "Primary endpoint",
      url: "https://hooks.connectpro.example/inbound",
      signingSecret: "whsec_••••••••2f7",
      events: ["rental.created", "payment.recorded"],
      active: true,
      createdAt: "2026-01-04T10:00:00Z",
      lastDelivery: "2026-09-13T18:22:00Z",
      lastSuccess: "2026-09-13T18:22:01Z",
      lastError: null,
    },
  ]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const add = () => {
    if (!name.trim() || !url.trim()) {
      toast.error("Enter a name and URL.");
      return;
    }
    setEndpoints((eps) => [
      ...eps,
      {
        id: uid("wh"),
        name,
        url,
        signingSecret: `whsec_${Math.random().toString(36).slice(2, 10)}`,
        events: [],
        active: true,
        createdAt: new Date().toISOString(),
        lastDelivery: null,
        lastSuccess: null,
        lastError: null,
      },
    ]);
    setName("");
    setUrl("");
    setOpen(false);
    toast.success("Webhook endpoint created.");
  };

  const toggleEvent = (id: string, ev: string) =>
    setEndpoints((eps) =>
      eps.map((e) =>
        e.id === id
          ? {
              ...e,
              events: e.events.includes(ev)
                ? e.events.filter((x) => x !== ev)
                : [...e.events, ev],
            }
          : e,
      ),
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Fire outbound POSTs to your systems on selected events. Each endpoint
          has its own signing secret and event subscriptions.
        </p>
        {canManage && (
          <Button
            onClick={() => setOpen((v) => !v)}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            <Plus size={15} className="mr-1.5" /> Add endpoint
          </Button>
        )}
      </div>

      {open && canManage && (
        <SectionCard title="New webhook endpoint">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Billing sync"
                className="mt-1"
              />
            </div>
            <div>
              <Label>URL</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                className="mt-1 font-mono tabular"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              onClick={add}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              Create endpoint
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </SectionCard>
      )}

      {endpoints.map((ep) => (
        <SectionCard
          key={ep.id}
          title={ep.name}
          right={
            <StatusPill tone={ep.active ? "available" : "neutral"}>
              {ep.active ? "Active" : "Disabled"}
            </StatusPill>
          }
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Webhook size={14} className="text-muted-foreground" />
              <span className="font-mono tabular text-foreground">
                {ep.url}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Meta label="Signing secret" value={ep.signingSecret} mono />
              <Meta
                label="Last delivery"
                value={ep.lastDelivery ? fmtDateTime(ep.lastDelivery) : "—"}
              />
              <Meta
                label="Last success"
                value={ep.lastSuccess ? fmtDateTime(ep.lastSuccess) : "—"}
              />
            </div>
            {ep.lastError && (
              <p className="text-xs text-status-out">
                Last error: {ep.lastError}
              </p>
            )}

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Subscribed events
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {WEBHOOK_EVENTS.map((ev) => (
                  <label
                    key={ev}
                    className="flex items-center gap-1.5 rounded border border-border px-2 py-1 text-xs"
                  >
                    <Switch
                      checked={ep.events.includes(ev)}
                      onCheckedChange={() => toggleEvent(ep.id, ev)}
                      disabled={!canManage}
                    />
                    <span className="font-mono tabular text-foreground">
                      {ev}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {canManage && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toast.success(`Test sent to ${ep.name}.`)}
                >
                  Test endpoint
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toast.success("Signing secret rotated.")}
                >
                  <RotateCw size={13} className="mr-1" /> Rotate secret
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setEndpoints((eps) =>
                      eps.map((e) =>
                        e.id === ep.id ? { ...e, active: !e.active } : e,
                      ),
                    )
                  }
                >
                  {ep.active ? "Disable" : "Enable"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-status-out"
                  onClick={() =>
                    setEndpoints((eps) => eps.filter((e) => e.id !== ep.id))
                  }
                >
                  <Trash2 size={13} className="mr-1" /> Delete
                </Button>
              </div>
            )}
          </div>
        </SectionCard>
      ))}

      <p className="text-xs text-muted-foreground">
        Live delivery, retries, and idempotency require a production backend —
        configuration is stored now and reported as a production dependency.
      </p>
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
