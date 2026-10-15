// Connect Pro Fleet — Settings domain types.
// Extracted from types.ts to keep each module focused. types.ts re-exports
// these for import compatibility.
import type { VehicleType } from "./types";

export interface CompanyInfo {
  legal_name: string;
  dba: string;
  logo_url: string | null;
  business_phone: string;
  business_email: string;
  website: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  tax_id: string | null;
  registration_number: string | null;
  support_email: string | null;
  support_phone: string | null;
  timezone: string;
  currency: string;
  language: string;
}

export interface PermissionDef {
  key: string;
  label: string;
  module: string;
}

export interface Role {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  is_system: boolean;
  is_protected: boolean;
  active: boolean;
  permissions: Record<string, boolean>;
  created_at: string;
}

export type AddonPricingType =
  "one_time" | "per_day" | "per_week" | "per_rental" | "custom";

export interface AddonCatalogItem {
  id: string;
  tenant_id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  pricing_type: AddonPricingType;
  taxable: boolean;
  required: boolean;
  active: boolean;
  display_order: number;
  created_at: string;
}

export interface AddonCategory {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  active: boolean;
  display_order: number;
  created_at: string;
}

// A Vehicle Class is the core pricing entity. Every active vehicle belongs to
// a class which seeds its daily/weekly rate, minimum rental duration, and
// default deposit policy. Staff can override any of these per vehicle.
// Organizations can create unlimited custom classes — there is no hard-coded
// limit. Evolved from the earlier PricingPlan concept.
export interface VehicleClass {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  daily_rate: number;
  weekly_rate: number;
  minimum_rental_duration: number; // in days
  minimum_rental_unit: "day";
  default_deposit_policy_id: string | null;
  active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/** @deprecated Renamed to VehicleClass. Kept for import compatibility. */
export type PricingPlan = VehicleClass;

export interface DepositPolicy {
  id: string;
  tenant_id: string;
  name: string;
  amount: number;
  description: string;
  vehicle_class_id?: string | null;
  vehicle_type?: VehicleType | null;
  is_default: boolean;
  active: boolean;
  created_at: string;
}

export type AgreementTemplateStatus =
  "draft" | "active" | "inactive" | "superseded";

export interface AgreementTemplate {
  id: string;
  tenant_id: string;
  name: string;
  agreement_type: string;
  description: string;
  file_url: string;
  file_name: string;
  version: number;
  effective_date: string;
  status: AgreementTemplateStatus;
  is_default: boolean;
  created_at: string;
  created_by: string | null;
}

export interface AgreementRules {
  default_template_id: string | null;
  master_duration_days: number;
  require_resign_on_expiry: boolean;
  require_resign_on_vehicle_change: boolean;
  require_resign_on_rate_change: boolean;
  require_resign_on_terms_change: boolean;
  require_manual_resign: boolean;
}

export interface SettingsAuditEntry {
  id: string;
  tenant_id: string;
  at: string;
  actor_id: string | null;
  action: string;
  detail?: string | null;
  old_value?: string | null;
  new_value?: string | null;
}
