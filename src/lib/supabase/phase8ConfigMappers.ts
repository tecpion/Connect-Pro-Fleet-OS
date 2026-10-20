// Connect Pro Fleet — Phase 8 row ↔ domain mappers: company settings +
// vehicle classes (pricing) + add-ons.

import type {
  VehicleClass,
  AddonCatalogItem,
  AddonCategory,
  CompanyInfo,
} from "../settingsTypes";
import type { CompanyPolicies } from "../companyPolicyTypes";
import type { AgreementRules } from "../settingsTypes";
import type { TaxRule } from "../taxFeeTypes";
import type { FeeRule } from "../taxFeeTypes";
import type {
  CompanySettingsRow,
  AddonCategoryRow,
  AddonCatalogItemRow,
  VehicleClassRow,
} from "./dbTypesCore";
import { toMoney } from "./repository";

// ---------------------------------------------------------------------------
// Company settings — one authoritative record per organization.
//
// The structured config model is preserved as durable JSON. We do NOT flatten
// or over-normalize CompanyPolicies / agreementRules / taxRules / feeRules
// into separate tables — Phase 8A established company_settings as the single
// authoritative settings row, and these structured configs live inside its
// settings_config JSON column. CompanyInfo (incl. timezone) lives in the
// company_info JSON column and is authoritative after relogin.
// ---------------------------------------------------------------------------

/** The structured payload persisted in company_settings.settings_config. */
export interface CompanySettingsConfig {
  companyPolicies: CompanyPolicies;
  agreementRules: AgreementRules;
  taxRules: TaxRule[];
  feeRules: FeeRule[];
}

export function rowToCompanySettings(
  r: CompanySettingsRow,
): { companyInfo: CompanyInfo; settingsConfig: CompanySettingsConfig } | null {
  const companyInfo = r.company_info as unknown as CompanyInfo | null;
  const settingsConfig =
    r.settings_config as unknown as CompanySettingsConfig | null;
  if (!companyInfo) return null;
  return {
    companyInfo,
    settingsConfig: settingsConfig ?? {
      companyPolicies: {} as CompanyPolicies,
      agreementRules: {} as AgreementRules,
      taxRules: [],
      feeRules: [],
    },
  };
}

export function companySettingsToRow(
  orgId: string,
  companyInfo: CompanyInfo,
  settingsConfig: CompanySettingsConfig,
): Partial<CompanySettingsRow> {
  return {
    organization_id: orgId,
    company_info: companyInfo as unknown as CompanySettingsRow["company_info"],
    settings_config:
      settingsConfig as unknown as CompanySettingsRow["settings_config"],
  };
}

// ---------------------------------------------------------------------------
// Vehicle classes / pricing configuration
// ---------------------------------------------------------------------------

export function rowToVehicleClass(r: VehicleClassRow): VehicleClass {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    name: r.name,
    description: r.description,
    daily_rate: toMoney(r.daily_rate),
    weekly_rate: toMoney(r.weekly_rate),
    minimum_rental_duration: r.minimum_rental_duration,
    minimum_rental_unit:
      r.minimum_rental_unit as VehicleClass["minimum_rental_unit"],
    default_deposit_policy_id: r.default_deposit_policy_id,
    active: r.active,
    display_order: r.display_order,
    created_at: r.created_at,
    updated_at: r.updated_at,
    created_by: r.created_by,
  };
}

export function vehicleClassToRow(c: VehicleClass): Partial<VehicleClassRow> {
  return {
    id: c.id,
    organization_id: c.tenant_id,
    name: c.name,
    description: c.description,
    daily_rate: c.daily_rate,
    weekly_rate: c.weekly_rate,
    minimum_rental_duration: c.minimum_rental_duration,
    minimum_rental_unit: c.minimum_rental_unit,
    default_deposit_policy_id: c.default_deposit_policy_id,
    active: c.active,
    display_order: c.display_order,
    created_by: c.created_by,
  };
}

export function vehicleClassPatchToRow(
  patch: Partial<VehicleClass>,
): Partial<VehicleClassRow> {
  const row: Partial<VehicleClassRow> = {};
  if (patch.tenant_id !== undefined) row.organization_id = patch.tenant_id;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.daily_rate !== undefined) row.daily_rate = patch.daily_rate;
  if (patch.weekly_rate !== undefined) row.weekly_rate = patch.weekly_rate;
  if (patch.minimum_rental_duration !== undefined)
    row.minimum_rental_duration = patch.minimum_rental_duration;
  if (patch.minimum_rental_unit !== undefined)
    row.minimum_rental_unit = patch.minimum_rental_unit;
  if (patch.default_deposit_policy_id !== undefined)
    row.default_deposit_policy_id = patch.default_deposit_policy_id;
  if (patch.active !== undefined) row.active = patch.active;
  if (patch.display_order !== undefined)
    row.display_order = patch.display_order;
  if (patch.created_by !== undefined) row.created_by = patch.created_by;
  return row;
}

// ---------------------------------------------------------------------------
// Add-on categories
// ---------------------------------------------------------------------------

export function rowToAddonCategory(r: AddonCategoryRow): AddonCategory {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    name: r.name,
    description: r.description,
    active: r.active,
    display_order: r.display_order,
    created_at: r.created_at,
  };
}

export function addonCategoryToRow(
  c: AddonCategory,
): Partial<AddonCategoryRow> {
  return {
    id: c.id,
    organization_id: c.tenant_id,
    name: c.name,
    description: c.description,
    active: c.active,
    display_order: c.display_order,
  };
}

export function addonCategoryPatchToRow(
  patch: Partial<AddonCategory>,
): Partial<AddonCategoryRow> {
  const row: Partial<AddonCategoryRow> = {};
  if (patch.tenant_id !== undefined) row.organization_id = patch.tenant_id;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.active !== undefined) row.active = patch.active;
  if (patch.display_order !== undefined)
    row.display_order = patch.display_order;
  return row;
}

// ---------------------------------------------------------------------------
// Add-on catalog items
// ---------------------------------------------------------------------------

export function rowToAddonCatalogItem(
  r: AddonCatalogItemRow,
): AddonCatalogItem {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    category_id: r.category_id ?? "",
    name: r.name,
    description: r.description,
    price: toMoney(r.price),
    pricing_type: r.pricing_type as AddonCatalogItem["pricing_type"],
    taxable: r.taxable,
    required: r.required,
    active: r.active,
    display_order: r.display_order,
    created_at: r.created_at,
  };
}

export function addonCatalogItemToRow(
  a: AddonCatalogItem,
): Partial<AddonCatalogItemRow> {
  return {
    id: a.id,
    organization_id: a.tenant_id,
    category_id: a.category_id || null,
    name: a.name,
    description: a.description,
    price: a.price,
    pricing_type: a.pricing_type,
    taxable: a.taxable,
    required: a.required,
    active: a.active,
    display_order: a.display_order,
  };
}

export function addonCatalogItemPatchToRow(
  patch: Partial<AddonCatalogItem>,
): Partial<AddonCatalogItemRow> {
  const row: Partial<AddonCatalogItemRow> = {};
  if (patch.tenant_id !== undefined) row.organization_id = patch.tenant_id;
  if (patch.category_id !== undefined)
    row.category_id = patch.category_id || null;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.price !== undefined) row.price = patch.price;
  if (patch.pricing_type !== undefined) row.pricing_type = patch.pricing_type;
  if (patch.taxable !== undefined) row.taxable = patch.taxable;
  if (patch.required !== undefined) row.required = patch.required;
  if (patch.active !== undefined) row.active = patch.active;
  if (patch.display_order !== undefined)
    row.display_order = patch.display_order;
  return row;
}
