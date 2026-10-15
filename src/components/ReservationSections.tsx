import { useState } from "react";
import { Link } from "@/lib/router-compat";
import { useStore, uid, TENANT_ID } from "@/lib/store";
import { SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RecordPaymentDialog } from "@/components/RecordPaymentDialog";
import { toast } from "sonner";
import { Plus, Trash2, DollarSign } from "lucide-react";
import { fmtMoney, fmtMoneyExact, addonMeta } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AddonType, Reservation } from "@/lib/types";

export function ReservationAddons({ res }: { res: Reservation }) {
  const { addons, addAddon, removeAddon } = useStore();
  const [addonType, setAddonType] = useState<AddonType>("extra_driver");

  const resAddons = addons.filter((a) => a.reservation_id === res.id);
  const addonTotal = resAddons.reduce((s, a) => s + a.price * a.quantity, 0);
  const grandTotal = res.total_price + addonTotal;
  const balanceDue = Math.max(0, grandTotal - res.amount_paid);

  return (
    <SectionCard
      title="Add-ons & extras"
      right={
        <span className="font-mono text-sm tabular text-foreground">
          {fmtMoney(addonTotal)}
        </span>
      }
    >
      {resAddons.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No add-ons attached. Add upsells like extra driver, delivery, or a
          damage waiver below.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {resAddons.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {addonMeta[a.addon_type].label}
                </p>
                <p className="font-mono text-xs tabular text-muted-foreground">
                  {fmtMoneyExact(a.price)} × {a.quantity}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm tabular text-foreground">
                  {fmtMoneyExact(a.price * a.quantity)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    removeAddon(a.id);
                    toast.success("Add-on removed.");
                  }}
                  aria-label="Remove add-on"
                >
                  <Trash2 size={15} className="text-muted-foreground" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
        <select
          value={addonType}
          onChange={(e) => setAddonType(e.target.value as AddonType)}
          className="rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {Object.entries(addonMeta).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label} — {fmtMoneyExact(v.price)}
            </option>
          ))}
        </select>
        <Button
          onClick={() => {
            addAddon({
              id: uid("add"),
              reservation_id: res.id,
              addon_type: addonType,
              price: addonMeta[addonType].price,
              quantity: 1,
              tenant_id: TENANT_ID,
            });
            toast.success(`${addonMeta[addonType].label} added.`);
          }}
          className="bg-primary text-primary-foreground hover:bg-primary-press"
        >
          <Plus size={15} className="mr-1.5" /> Add
        </Button>
      </div>

      <div className="mt-4 space-y-2 rounded-md bg-surface-2 px-3 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">
            Grand total
          </span>
          <span className="font-mono text-base font-semibold tabular text-foreground">
            {fmtMoneyExact(grandTotal)}
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="text-sm text-muted-foreground">Paid so far</span>
          <span className="font-mono text-sm tabular text-status-available">
            {fmtMoneyExact(res.amount_paid)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Balance due</span>
          <span
            className={cn(
              "font-mono text-sm tabular",
              balanceDue > 0
                ? "text-status-maintenance"
                : "text-status-available",
            )}
          >
            {fmtMoneyExact(balanceDue)}
          </span>
        </div>
      </div>
    </SectionCard>
  );
}

export function ReservationPaymentDialog({
  res,
  balanceDue,
  onPaid,
}: {
  res: Reservation;
  balanceDue: number;
  onPaid: (amount: number) => void;
}) {
  const { recordPayment, logActivity } = useStore();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        <DollarSign size={15} className="mr-1.5" /> Record payment
      </Button>
      <RecordPaymentDialog
        open={open}
        onOpenChange={setOpen}
        balanceDue={balanceDue}
        onSubmit={(r) => {
          // Reservation-level payment: record against the reservation's
          // amount_paid (clamped). The canonical tender is captured for
          // future reporting when the reservation converts to a rental.
          recordPayment(res.id, r.amount);
          logActivity({
            id: uid("act"),
            at: new Date().toISOString(),
            label: `Payment recorded — ${fmtMoney(r.amount)} (${r.tender}) from ${res.renter_name}`,
            tone: "available",
          });
          toast.success(`Recorded ${fmtMoney(r.amount)}. Balance updated.`);
          onPaid(r.amount);
        }}
      />
    </>
  );
}
