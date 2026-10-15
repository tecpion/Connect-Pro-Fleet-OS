// Connect Pro Fleet — Vehicle Vault document numbering (Build #45).
//
// Tenant-scoped, unique, immutable document numbers with type prefixes
// (REC-2026-000001, CER-2026-000001, BOS-2026-000001, …). A synchronous ref
// registry guarantees uniqueness even for rapid synchronous creation inside a
// single batched act(). Issued numbers are never reused — voided numbers stay
// consumed (spec §31).

import type { VaultDocCategory } from "./vaultTypes";
import { VAULT_DOC_PREFIX } from "./vaultTypes";

/** Format: PREFIX-YYYY-NNNNNN */
export function formatDocNumber(
  category: VaultDocCategory,
  year: number,
  seq: number,
): string {
  const prefix = VAULT_DOC_PREFIX[category] ?? "DOC";
  const seqStr = String(seq).padStart(6, "0");
  return `${prefix}-${year}-${seqStr}`;
}

/** Registry of issued document numbers per tenant. Tracks the next sequence
 *  per (prefix, year) and the set of already-issued numbers. */
export class VaultNumberRegistry {
  private issued: Set<string>;
  private counters: Map<string, number>; // `${prefix}-${year}` -> next seq

  constructor(existingNumbers: string[] = []) {
    this.issued = new Set(existingNumbers);
    this.counters = new Map();
    for (const num of existingNumbers) {
      const parsed = parseDocNumber(num);
      if (parsed) {
        const key = `${parsed.prefix}-${parsed.year}`;
        const cur = this.counters.get(key) ?? 0;
        if (parsed.seq >= cur) this.counters.set(key, parsed.seq + 1);
      }
    }
  }

  /** Issue the next number for a category + year. Throws if the generated
   *  number is already issued (defensive — should never happen given the
   *  monotonic counter). */
  issue(category: VaultDocCategory, year: number): string {
    const prefix = VAULT_DOC_PREFIX[category] ?? "DOC";
    const key = `${prefix}-${year}`;
    let seq = this.counters.get(key) ?? 1;
    // Guard against collisions with pre-existing numbers that didn't parse
    // cleanly (e.g. imported custom numbers).
    let num = formatDocNumber(category, year, seq);
    while (this.issued.has(num)) {
      seq += 1;
      num = formatDocNumber(category, year, seq);
    }
    this.counters.set(key, seq + 1);
    this.issued.add(num);
    return num;
  }

  has(num: string): boolean {
    return this.issued.has(num);
  }

  /** Snapshot of issued numbers (for seeding / persistence). */
  issuedNumbers(): string[] {
    return Array.from(this.issued);
  }
}

/** Parse a document number into its components. */
export function parseDocNumber(
  num: string,
): { prefix: string; year: number; seq: number } | null {
  const m = /^([A-Z]+)-(\d{4})-(\d+)$/.exec(num);
  if (!m) return null;
  return { prefix: m[1], year: Number(m[2]), seq: Number(m[3]) };
}

/** Tenant isolation check: a document number is only valid if it belongs to
 *  the given tenant's registry. (In memory mode the registry is per-provider;
 *  this helper exists for explicit tenant-scoping tests.) */
export function isNumberIssuedBy(
  registry: VaultNumberRegistry,
  num: string,
): boolean {
  return registry.has(num);
}
