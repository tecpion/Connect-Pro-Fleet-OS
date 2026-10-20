// Connect Pro Fleet — Phase 10B Lead store hydration + persistence sync.
//
// Mirrors the phase2StoreSync pattern: the frozen in-memory Lead store keeps
// its useState arrays as the UI cache; this module hydrates them from Cloud on
// auth/org change and persists mutations through the repository abstraction
// (UI -> store method -> repository -> Cloud). In memory mode (no Cloud
// config) every function is a no-op so the seeded/demo experience is
// unchanged.
//
// Leads are pre-rental CRM contacts. They are NEVER surfaced through Customer
// reporting, the 360 view, collections, the ledger, or active-rental
// reporting. Customer creation stays tied to the existing Reservation
// lifecycle, as before.

import type { Lead } from "../leadTypes";
import { getBackendMode } from "./client";
import { createRepositories } from "./repository";
import type { LeadRepository } from "./repository";

function repos(): LeadRepository | null {
  if (getBackendMode() !== "supabase") return null;
  return createRepositories().leads;
}

export interface LeadSyncHandles {
  setLeads: (updater: (prev: Lead[]) => Lead[]) => void;
}

/**
 * Hydrate Leads from Cloud into the store cache. Returns true when Cloud mode
 * is active and hydration ran. On read failure the seeded in-memory cache
 * stays (never wipes valid local state).
 */
export async function hydrateLeads(
  orgId: string,
  handles: LeadSyncHandles,
  repository?: LeadRepository | null,
): Promise<boolean> {
  const r = repository ?? repos();
  if (!r) return false;
  try {
    const leads = await r.list(orgId);
    handles.setLeads(() => leads);
    return true;
  } catch {
    return false;
  }
}

export function persistLeadInsert(lead: Lead): void {
  const r = repos();
  if (!r) return;
  void r.insert(lead).catch(() => {});
}

export function persistLeadUpdate(
  orgId: string,
  id: string,
  patch: Partial<Lead>,
): void {
  const r = repos();
  if (!r) return;
  void r.update(orgId, id, patch).catch(() => {});
}
