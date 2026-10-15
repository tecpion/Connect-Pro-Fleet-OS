// Connect Pro Fleet — external-id registry helpers (Build #21).
//
// Stable mapping between Fleet internal entities and external-system ids. The
// registry key is (tenant + system + entity_type + external_id) so the same
// external id string may exist across tenants without collision. Duplicate
// mapping within a tenant+system+entity+external_id is blocked (returns the
// existing ref id, updating the internal link non-destructively).

import type {
  ExternalEntityReference,
  ExternalEntityType,
  IntegrationSystem,
} from "./integrationTypes";
import { TENANT_ID, uid } from "./store/ids";

export interface RegistryState {
  /** Live getter backed by a ref so rapid sequential calls within one batched
   *  act() always read the latest external refs (not a stale closure). */
  getExternalRefs: () => ExternalEntityReference[];
  setExternalRefs: React.Dispatch<
    React.SetStateAction<ExternalEntityReference[]>
  >;
}

export function buildRegistryMethods(rs: RegistryState) {
  const now = () => new Date().toISOString();

  function mapExternalId(input: {
    system: IntegrationSystem;
    entity_type: ExternalEntityType;
    internal_id: string;
    external_id: string;
    external_parent_id?: string | null;
    metadata?: Record<string, unknown> | null;
  }): string {
    const refs = rs.getExternalRefs();
    const existing = refs.find(
      (r) =>
        r.system === input.system &&
        r.entity_type === input.entity_type &&
        r.external_id === input.external_id,
    );
    if (existing) {
      if (existing.internal_id !== input.internal_id) {
        rs.setExternalRefs((all) =>
          all.map((r) =>
            r.id === existing.id
              ? {
                  ...r,
                  internal_id: input.internal_id,
                  external_parent_id: input.external_parent_id ?? null,
                  updated_at: now(),
                }
              : r,
          ),
        );
      }
      return existing.id;
    }
    const ref: ExternalEntityReference = {
      id: uid("xref"),
      tenant_id: TENANT_ID,
      system: input.system,
      entity_type: input.entity_type,
      internal_id: input.internal_id,
      external_id: input.external_id,
      external_parent_id: input.external_parent_id ?? null,
      status: "active",
      created_at: now(),
      updated_at: now(),
      metadata: input.metadata ?? null,
    };
    rs.setExternalRefs((all) => [...all, ref]);
    return ref.id;
  }

  function resolveInternalId(input: {
    system: IntegrationSystem;
    entity_type: ExternalEntityType;
    external_id: string;
  }): string | null {
    const ref = rs
      .getExternalRefs()
      .find(
        (r) =>
          r.system === input.system &&
          r.entity_type === input.entity_type &&
          r.external_id === input.external_id &&
          r.status === "active",
      );
    return ref?.internal_id ?? null;
  }

  function resolveExternalId(input: {
    entity_type: ExternalEntityType;
    internal_id: string;
    system?: IntegrationSystem;
  }): string | null {
    const ref = rs
      .getExternalRefs()
      .find(
        (r) =>
          r.entity_type === input.entity_type &&
          r.internal_id === input.internal_id &&
          r.status === "active" &&
          (input.system ? r.system === input.system : true),
      );
    return ref?.external_id ?? null;
  }

  function refsForEntity(
    entity_type: ExternalEntityType,
    internal_id: string,
  ): ExternalEntityReference[] {
    return rs
      .getExternalRefs()
      .filter(
        (r) =>
          r.entity_type === entity_type &&
          r.internal_id === internal_id &&
          r.status === "active",
      );
  }

  return { mapExternalId, resolveInternalId, resolveExternalId, refsForEntity };
}

export type RegistryMethods = ReturnType<typeof buildRegistryMethods>;
