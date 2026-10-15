// Connect Pro Fleet — Rental actions panel (Build #3).
// Extracted from RentalDetail.tsx (which is at its size ceiling). Renders the
// command-center action buttons for a rental. State setters for the dialogs
// are passed in so the dialogs (in RentalDialogs) stay controlled by the page.

import { useStore, uid } from "@/lib/store";
import type { Customer, RentalAgreement } from "@/lib/types";
import { SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  DollarSign,
  CalendarPlus,
  RefreshCw,
  Link2,
  Plus,
  ClipboardCheck,
  RotateCcw,
  Phone,
  Mail,
  ListTodo,
} from "lucide-react";
import type { ChargeType } from "@/lib/types";

const ACTIVE_STATES = ["active", "late", "overdue", "payment_due"];

export interface RentalActionHandlers {
  setPayOpen: (v: boolean) => void;
  setExtendOpen: (v: boolean) => void;
  setChargeOpen: (v: boolean) => void;
  setChargeType: (v: ChargeType) => void;
  setChargeAmount: (v: number) => void;
  setChargeDesc: (v: string) => void;
  openExchange?: (rentalId: string) => void;
  setTaskOpen?: (v: boolean) => void;
}

export function RentalActions({
  rental,
  customer,
  handlers,
  navigate,
}: {
  rental: RentalAgreement;
  customer: Customer | undefined;
  handlers: RentalActionHandlers;
  navigate: (path: string) => void;
}) {
  const { logActivity } = useStore();
  const isActive = ACTIVE_STATES.includes(rental.status);

  return (
    <SectionCard title="Rental actions">
      <div className="space-y-2">
        <Button
          className="w-full bg-primary text-primary-foreground hover:bg-primary-press"
          onClick={() => handlers.setPayOpen(true)}
        >
          <DollarSign size={16} className="mr-1.5" /> Record payment
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => handlers.setExtendOpen(true)}
        >
          <CalendarPlus size={16} className="mr-1.5" /> Extend rental
        </Button>
        <Button
          variant="outline"
          className="w-full"
          disabled={!isActive}
          onClick={() => handlers.openExchange?.(rental.id)}
        >
          <RefreshCw size={16} className="mr-1.5" /> Exchange vehicle
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            if (!customer?.email) {
              toast.error("No email on file for this customer.");
              return;
            }
            toast.success(`Payment link sent to ${customer.email}.`);
            logActivity({
              id: uid("act"),
              at: new Date().toISOString(),
              label: `Payment link sent — ${rental.agreement_number}`,
              tone: "neutral",
            });
          }}
        >
          <Link2 size={16} className="mr-1.5" /> Send payment link
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            handlers.setChargeType("miscellaneous_charge");
            handlers.setChargeAmount(0);
            handlers.setChargeDesc("");
            handlers.setChargeOpen(true);
          }}
        >
          <Plus size={16} className="mr-1.5" /> Add charge
        </Button>
        {handlers.setTaskOpen && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => handlers.setTaskOpen?.(true)}
          >
            <ListTodo size={16} className="mr-1.5" /> Create task
          </Button>
        )}
        <Button
          variant="outline"
          className="w-full"
          onClick={() =>
            navigate(
              `/inspections/new?res=${rental.reservation_id ?? ""}&type=checkout`,
            )
          }
        >
          <ClipboardCheck size={16} className="mr-1.5" /> Open inspection
        </Button>
        {rental.status === "ready_for_checkout" && (
          <Button
            className="w-full bg-primary text-primary-foreground hover:bg-primary-press"
            onClick={() => navigate(`/checkout/${rental.id}`)}
          >
            <ClipboardCheck size={16} className="mr-1.5" /> Start checkout
          </Button>
        )}
        <Button
          variant="outline"
          className="w-full"
          disabled={!isActive}
          onClick={() => navigate(`/return/${rental.id}`)}
        >
          <RotateCcw size={16} className="mr-1.5" /> Return vehicle
        </Button>
        <div className="grid grid-cols-2 gap-2 pt-1">
          {customer && (
            <a
              href={`tel:${customer.phone}`}
              className="flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-2"
            >
              <Phone size={15} /> Call
            </a>
          )}
          {customer && (
            <a
              href={`mailto:${customer.email}`}
              className="flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-2"
            >
              <Mail size={15} /> Email
            </a>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
