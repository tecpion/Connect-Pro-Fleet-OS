// Connect Pro Fleet — Rental arrangement section (Build #10).
// Extracted from RentalDetail to keep that file under the line limit.

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { fmtMoneyExact } from "@/lib/format";
import { ArrangementPanel } from "@/components/ArrangementPanel";
import { CreateArrangementDialog } from "@/pages/arrangements/CreateArrangementDialog";
import type { RentalAgreement } from "@/lib/types";

export function RentalArrangementSection({
  rental,
}: {
  rental: RentalAgreement;
}) {
  const { activeArrangementForRental } = useStore();
  const [open, setOpen] = useState(false);
  const active = activeArrangementForRental(rental.id);

  if (active) return <ArrangementPanel arrangementId={active.id} />;

  if (rental.balance_due <= 0) return null;

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <p className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
        Payment arrangement
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        No arrangement. Record a promise to pay the{" "}
        {fmtMoneyExact(rental.balance_due)} balance over time.
      </p>
      <Button variant="outline" className="mt-3" onClick={() => setOpen(true)}>
        Create arrangement
      </Button>
      <CreateArrangementDialog
        open={open}
        onOpenChange={setOpen}
        rentalId={rental.id}
      />
    </section>
  );
}
