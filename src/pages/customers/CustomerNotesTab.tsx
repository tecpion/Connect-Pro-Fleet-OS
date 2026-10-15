// Connect Pro Fleet — Customer notes tab (Build #10).
// Extracted from CustomerProfile to keep it under the line limit.

import { SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { StickyNote } from "lucide-react";
import type { Customer } from "@/lib/types";

export function CustomerNotesTab({ customer }: { customer: Customer }) {
  return (
    <SectionCard title="Notes">
      <div className="rounded-md border border-border bg-surface-2 px-3 py-3">
        <p className="text-sm text-foreground">
          {customer.notes ||
            "No notes yet. Add context for the next staff member who handles this customer."}
        </p>
      </div>
      <Button variant="outline" className="mt-3">
        <StickyNote size={15} className="mr-1.5" /> Add note
      </Button>
    </SectionCard>
  );
}
