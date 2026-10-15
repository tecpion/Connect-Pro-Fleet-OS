// Connect Pro Fleet — Vehicle ownership + compensation domain (Build #6).
//
// Establishes the distinction between WHO OWNS THE VEHICLE (an asset fact,
// stored on the Vehicle) and HOW THAT OWNER / PARTNER IS COMPENSATED (a
// business agreement, stored on the InvestorVehicle pairing). These are
// separate concepts and must remain separate throughout the architecture.
//
// V1 supports ONE primary external owner / investor relationship per vehicle.
// The type structure is designed so future versions can support multiple
// investors per vehicle, ownership percentages, and agreement versioning
// without a breaking reshape.

// ---------------------------------------------------------------------------
// Ownership types (asset fact — lives on the Vehicle)
// ---------------------------------------------------------------------------

export type VehicleOwnershipType =
  | "company_owned"
  | "external_owner"
  | "business_partner_owned"
  | "jointly_owned"
  | "other";

export const OWNERSHIP_TYPE_LABELS: Record<VehicleOwnershipType, string> = {
  company_owned: "Company Owned",
  external_owner: "External Owner / Investor Owned",
  business_partner_owned: "Business Partner Owned",
  jointly_owned: "Jointly Owned",
  other: "Other",
};

// Ownership fields that live on the Vehicle record. Optional on the type so
// existing vehicles migrate cleanly (defaulting to company_owned).
export interface VehicleOwnershipFields {
  ownership_type: VehicleOwnershipType;
  owner_entity_id: string | null; // -> Investor.id when external/partner
  owner_display_name: string | null; // snapshot/fallback label
  ownership_notes: string | null;
  ownership_effective_date: string | null;
}

// ---------------------------------------------------------------------------
// Compensation types (business agreement — lives on the InvestorVehicle pairing)
// ---------------------------------------------------------------------------

export type CompensationType = "percentage" | "fixed" | "custom";

export const COMPENSATION_TYPE_LABELS: Record<CompensationType, string> = {
  percentage: "Percentage",
  fixed: "Fixed",
  custom: "Custom",
};

export type CompensationBasis = "gross" | "net";

export const COMPENSATION_BASIS_LABELS: Record<CompensationBasis, string> = {
  gross: "Gross",
  net: "Net",
};

export type CompensationFrequency =
  "weekly" | "biweekly" | "monthly" | "custom";

export const COMPENSATION_FREQUENCY_LABELS: Record<
  CompensationFrequency,
  string
> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  custom: "Custom",
};

// Percentage compensation — split of (gross | net) between investor & operator.
export interface PercentageCompensation {
  type: "percentage";
  basis: CompensationBasis; // gross | net
  investor_percentage: number; // 0..100
  operator_percentage: number; // 0..100
  effective_date: string;
  end_date: string | null;
  notes: string | null;
}

// Fixed compensation — a guaranteed/conditional recurring amount.
export interface FixedCompensation {
  type: "fixed";
  fixed_amount: number;
  fixed_frequency: CompensationFrequency;
  guaranteed_when_not_rented: boolean;
  guaranteed_during_downtime: boolean;
  effective_date: string;
  end_date: string | null;
  notes: string | null;
}

// Custom compensation — structured notes / agreement description. Not
// automatically calculated yet; displayed as configured.
export interface CustomCompensation {
  type: "custom";
  description: string;
  effective_date: string;
  end_date: string | null;
  notes: string | null;
}

export type CompensationArrangement =
  PercentageCompensation | FixedCompensation | CustomCompensation;

// ---------------------------------------------------------------------------
// Ownership change history (audit trail — never overwrite ownership silently)
// ---------------------------------------------------------------------------

export interface OwnershipChangeRecord {
  id: string;
  tenant_id: string;
  vehicle_id: string;
  investor_id: string | null;
  old_ownership_type: VehicleOwnershipType | null;
  new_ownership_type: VehicleOwnershipType;
  old_owner_entity_id: string | null;
  new_owner_entity_id: string | null;
  effective_date: string;
  reason: string | null;
  changed_by: string | null;
  changed_at: string;
}
