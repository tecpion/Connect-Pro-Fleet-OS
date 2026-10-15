// Connect Pro Fleet — reusable entity assignment section (Build #24).
// Renders the operational assignment slots relevant to a given entity type
// using AssigneeDisplay. Keeps assignment visibility consistent across
// Rental / Customer / Vehicle / Work Order / Damage Claim detail screens.

import { SectionCard } from "@/components/ui-bits";
import { AssigneeDisplay } from "@/pages/staff/AssignStaffDialog";
import type {
  AssignmentEntityType,
  OperationalAssignmentType,
} from "@/lib/staffTypes";

interface AssignmentSlot {
  type: OperationalAssignmentType;
  label: string;
}

const SLOTS: Record<AssignmentEntityType, AssignmentSlot[]> = {
  rental: [
    { type: "rental_account_owner", label: "Account Owner" },
    { type: "rental_csr", label: "CSR" },
    { type: "rental_collections_owner", label: "Collections Owner" },
    { type: "rental_checkout_staff", label: "Check-Out Staff" },
    { type: "rental_return_staff", label: "Return Staff" },
  ],
  customer: [
    { type: "customer_account_owner", label: "Account Owner" },
    { type: "customer_csr", label: "CSR" },
  ],
  vehicle: [
    { type: "vehicle_fleet_manager", label: "Fleet Manager" },
    {
      type: "vehicle_maintenance_coordinator",
      label: "Maintenance Coordinator",
    },
    { type: "vehicle_porter", label: "Porter / Runner" },
  ],
  work_order: [
    { type: "work_order_coordinator", label: "Coordinator" },
    { type: "work_order_assigned_staff", label: "Assigned Staff" },
  ],
  damage_claim: [
    { type: "damage_claim_owner", label: "Claim Owner" },
    { type: "damage_adjuster", label: "Adjuster / Insurance Follow-Up" },
    { type: "damage_repair_coordinator", label: "Repair Coordinator" },
  ],
  banking: [
    { type: "banking_transaction_review", label: "Transaction Review" },
  ],
  investor: [
    { type: "investor_manager", label: "Investor Manager" },
    { type: "investor_settlement_reviewer", label: "Settlement Reviewer" },
  ],
  expense: [{ type: "expense_approved_by", label: "Approved By" }],
  violation: [
    { type: "violation_owner", label: "Violation Owner" },
    { type: "violation_review_coordinator", label: "Review Coordinator" },
  ],
  compliance: [
    { type: "compliance_owner", label: "Compliance Owner" },
    { type: "document_reviewer", label: "Document Reviewer" },
  ],
  general: [{ type: "general_owner", label: "Owner" }],
};

export function EntityAssignmentsSection({
  entityType,
  entityId,
  entityLabel,
  title = "Assigned Staff",
}: {
  entityType: AssignmentEntityType;
  entityId: string;
  entityLabel?: string | null;
  title?: string;
}) {
  const slots = SLOTS[entityType] ?? [];
  if (slots.length === 0) return null;

  return (
    <SectionCard title={title}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {slots.map((slot) => (
          <div
            key={slot.type}
            className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2"
          >
            <span className="text-xs font-medium text-muted-foreground">
              {slot.label}
            </span>
            <AssigneeDisplay
              entityType={entityType}
              entityId={entityId}
              assignmentType={slot.type}
              entityLabel={entityLabel ?? null}
            />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
