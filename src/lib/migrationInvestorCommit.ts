// Connect Pro Fleet — Build #19 cleanup: investor/partner import commit.
//
// Reuses the EXISTING investor store (addInvestor / addInvestorVehicle) and
// the main store's setVehicleOwnership — does NOT create a second investor
// model. Imported partnerships represent current/future agreement state;
// historical finalized settlements are never rewritten. Tenant isolation:
// the vehicle must exist in this tenant before a pairing is created.

import type { CompensationArrangement } from "./ownershipTypes";
import type { Investor, InvestorVehicle } from "./investorTypes";
import { TENANT_ID, uid } from "./store/ids";
import type { FleetStore } from "./store";

export interface InvestorImportInput {
  full_name: string;
  email: string | null;
  phone: string | null;
  relationship: "family" | "external";
  vehicle_id: string | null;
  ownership_type: "owned" | "contributed";
  compensation_type: "percentage" | "fixed" | "custom";
  investor_percentage: number | null;
  operator_percentage: number | null;
  basis: "gross" | "net";
  fixed_amount: number | null;
  fixed_frequency: "weekly" | "biweekly" | "monthly" | "custom" | null;
  guaranteed_when_not_rented: boolean | null;
  guaranteed_during_downtime: boolean | null;
  custom_description: string | null;
  effective_date: string;
  notes: string | null;
  external_id: string | null;
}

export interface InvestorImportResult {
  ok: boolean;
  action: "created" | "linked" | "skipped";
  investor_id?: string;
  pairing_id?: string;
  error?: string;
}

type InvestorLike = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
};

/** Find an existing investor by email/phone (high confidence) or normalized
 *  name (weak — warns, never auto-merges). */
export function findExistingInvestor(
  investors: InvestorLike[],
  input: InvestorImportInput,
): { investor: { id: string }; confidence: "high" | "weak" } | null {
  if (input.email) {
    const i = investors.find(
      (x) => x.email && x.email.toLowerCase() === input.email!.toLowerCase(),
    );
    if (i) return { investor: { id: i.id }, confidence: "high" };
  }
  if (input.phone) {
    const i = investors.find(
      (x) =>
        x.phone &&
        x.phone.replace(/\D/g, "") === input.phone!.replace(/\D/g, ""),
    );
    if (i) return { investor: { id: i.id }, confidence: "high" };
  }
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const i = investors.find((x) => norm(x.full_name) === norm(input.full_name));
  if (i) return { investor: { id: i.id }, confidence: "weak" };
  return null;
}

export function buildCompensationArrangement(
  input: InvestorImportInput,
): CompensationArrangement {
  if (input.compensation_type === "percentage") {
    return {
      type: "percentage",
      basis: input.basis,
      investor_percentage: input.investor_percentage ?? 0,
      operator_percentage: input.operator_percentage ?? 0,
      effective_date: input.effective_date,
      end_date: null,
      notes: input.notes ?? null,
    };
  }
  if (input.compensation_type === "fixed") {
    return {
      type: "fixed",
      fixed_amount: input.fixed_amount ?? 0,
      fixed_frequency:
        (input.fixed_frequency as
          "weekly" | "biweekly" | "monthly" | "custom") ?? "monthly",
      guaranteed_when_not_rented: input.guaranteed_when_not_rented ?? false,
      guaranteed_during_downtime: input.guaranteed_during_downtime ?? false,
      effective_date: input.effective_date,
      end_date: null,
      notes: input.notes ?? null,
    };
  }
  return {
    type: "custom",
    description: input.custom_description ?? "",
    effective_date: input.effective_date,
    end_date: null,
    notes: input.notes ?? null,
  };
}

export function commitInvestorImport(
  investorStore: {
    investors: InvestorLike[];
    addInvestor: (i: Investor) => void;
    addInvestorVehicle: (iv: InvestorVehicle) => void;
  },
  store: FleetStore,
  input: InvestorImportInput,
  mode: "skip" | "link" | "create" = "skip",
  importedFingerprints: Set<string>,
): InvestorImportResult {
  const fp = input.external_id ?? input.email ?? input.phone ?? input.full_name;
  if (fp && importedFingerprints.has(fp)) {
    return {
      ok: false,
      action: "skipped",
      error: "This investor was already imported in this session.",
    };
  }

  const existing = findExistingInvestor(investorStore.investors, input);
  let investorId: string;

  if (existing) {
    if (mode === "skip") {
      return {
        ok: false,
        action: "skipped",
        error:
          existing.confidence === "weak"
            ? "Possible duplicate investor (name match) — confirm Link or Create New."
            : "Duplicate investor (email/phone match).",
      };
    }
    if (mode === "link") {
      investorId = existing.investor.id;
    } else {
      if (existing.confidence === "high") {
        return {
          ok: false,
          action: "skipped",
          error: "Investor already exists (email/phone) — use Link instead.",
        };
      }
      investorId = createInvestorRecord(investorStore, input);
    }
  } else {
    investorId = createInvestorRecord(investorStore, input);
  }

  let pairingId: string | undefined;
  if (input.vehicle_id) {
    const vehicle = store.vehicles.find((v) => v.id === input.vehicle_id);
    if (!vehicle) {
      return {
        ok: false,
        action: "skipped",
        investor_id: investorId,
        error: "Vehicle not found in this tenant — pairing skipped.",
      };
    }
    const invPct =
      input.compensation_type === "percentage"
        ? (input.investor_percentage ?? 0)
        : 0;
    const opPct =
      input.compensation_type === "percentage"
        ? (input.operator_percentage ?? 0)
        : 0;
    pairingId = uid("iv");
    investorStore.addInvestorVehicle({
      id: pairingId,
      tenant_id: TENANT_ID,
      investor_id: investorId,
      vehicle_id: input.vehicle_id,
      ownership_type: input.ownership_type,
      revenue_split_investor_pct: invPct,
      revenue_split_operator_pct: opPct,
      agreement_id: null,
      active: true,
      compensation: buildCompensationArrangement(input),
      effective_date: input.effective_date,
    });
    store.setVehicleOwnership(
      input.vehicle_id,
      {
        ownership_type: "external_owner",
        owner_entity_id: investorId,
        owner_display_name: input.full_name,
        ownership_notes: input.notes ?? null,
        effective_date: input.effective_date,
        reason: "Imported investor/partner pairing",
      },
      store.currentStaffId,
    );
  }

  if (fp) importedFingerprints.add(fp);
  return {
    ok: true,
    action: existing ? "linked" : "created",
    investor_id: investorId,
    pairing_id: pairingId,
  };
}

function createInvestorRecord(
  investorStore: { addInvestor: (i: Investor) => void },
  input: InvestorImportInput,
): string {
  const id = uid("inv");
  investorStore.addInvestor({
    id,
    tenant_id: TENANT_ID,
    full_name: input.full_name,
    email: input.email ?? "",
    phone: input.phone ?? "",
    relationship: input.relationship,
    status: "active",
    joined_at: input.effective_date,
    exited_at: null,
    exit_reason: null,
  });
  return id;
}
