// Connect Pro Fleet — activity tone/category helpers (Staff workspace).
//
// Activity entries in the store carry a coarse `tone` (neutral / available /
// maintenance / out) inherited from fleet-status semantics. The Staff Activity
// feed must NOT mislabel unrelated records as "maintenance" simply because
// the original logging call defaulted to a maintenance tone. This module maps
// a TaskCategory (the authoritative work type) to a tone + a human-readable
// Activity Category, so the Staff Activity feed can display the real domain
// of a record instead of a generic fallback.

import type { TaskCategory } from "./taskTypes";

export type ActivityTone = "neutral" | "available" | "maintenance" | "out";

/**
 * A human-readable Activity Category used by the Staff Activity feed.
 * Mirrors the briefing category vocabulary where it overlaps, but stays
 * focused on the work types the Staff workspace surfaces.
 */
export type ActivityCategory =
  | "Customer Service"
  | "Collections"
  | "Payment Arrangement"
  | "Reservations"
  | "Checkout"
  | "Return"
  | "Vehicle"
  | "Maintenance"
  | "Inspection"
  | "Damage"
  | "Incident"
  | "Violation"
  | "Document"
  | "Deposit"
  | "Administrative"
  | "Other";

export const TASK_CATEGORY_TONE: Record<TaskCategory, ActivityTone> = {
  customer_follow_up: "neutral",
  payment_collection: "out",
  payment_arrangement: "out",
  reservation: "neutral",
  checkout: "neutral",
  return: "available",
  vehicle: "neutral",
  maintenance: "maintenance",
  inspection: "maintenance",
  damage: "out",
  incident: "out",
  violation: "out",
  document: "neutral",
  deposit: "neutral",
  administrative: "neutral",
  other: "neutral",
};

export const TASK_CATEGORY_ACTIVITY: Record<TaskCategory, ActivityCategory> = {
  customer_follow_up: "Customer Service",
  payment_collection: "Collections",
  payment_arrangement: "Payment Arrangement",
  reservation: "Reservations",
  checkout: "Checkout",
  return: "Return",
  vehicle: "Vehicle",
  maintenance: "Maintenance",
  inspection: "Inspection",
  damage: "Damage",
  incident: "Incident",
  violation: "Violation",
  document: "Document",
  deposit: "Deposit",
  administrative: "Administrative",
  other: "Other",
};

/** Resolve a tone from a TaskCategory. Falls back to "neutral". */
export function toneForTaskCategory(category: TaskCategory): ActivityTone {
  return TASK_CATEGORY_TONE[category] ?? "neutral";
}

/** Resolve a human-readable Activity Category from a TaskCategory. */
export function activityCategoryForTask(
  category: TaskCategory,
): ActivityCategory {
  return TASK_CATEGORY_ACTIVITY[category] ?? "Other";
}
