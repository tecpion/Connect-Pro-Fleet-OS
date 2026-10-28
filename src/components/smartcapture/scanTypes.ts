// Smart Capture — Scan types, options, and constants.
//
// Shared types for the mobile-first Scan experience. No business logic here —
// just the option catalog and the stage definitions used by the launcher.

export type ScanOptionId =
  | "plate"
  | "vin"
  | "vehicle_photo"
  | "registration"
  | "receipt"
  | "service_receipt"
  | "id"
  | "upload";

export interface ScanOption {
  id: ScanOptionId;
  label: string;
  hint: string;
  /** lucide icon component reference */
  icon: unknown;
}

export const SCAN_OPTIONS: ScanOption[] = [
  { id: "plate", label: "Scan License Plate", hint: "Identify a vehicle from its plate.", icon: "scan" },
  { id: "vin", label: "Scan VIN", hint: "Identify a vehicle from its VIN.", icon: "scan" },
  { id: "vehicle_photo", label: "Take Vehicle Photo", hint: "Find a vehicle or attach a photo.", icon: "camera" },
  { id: "registration", label: "Scan Registration", hint: "Identify a vehicle and review registration.", icon: "file" },
  { id: "receipt", label: "Scan Receipt", hint: "Prepare an expense from a receipt.", icon: "wallet" },
  { id: "service_receipt", label: "Scan Service Receipt", hint: "Prepare maintenance info from a service invoice.", icon: "wrench" },
  { id: "id", label: "Scan ID / License", hint: "Prepare customer information for review.", icon: "shield" },
  { id: "upload", label: "Upload Photo", hint: "Choose an existing image from your device.", icon: "upload" },
];

export type ScanStage =
  | "options"
  | "capture"
  | "enter_id"
  | "match_result"
  | "no_match"
  | "multiple_matches";

/** Whether this scan option is a vehicle-identification scan. */
export function isVehicleScan(opt: ScanOptionId | null): boolean {
  return (
    opt === "plate" ||
    opt === "vin" ||
    opt === "registration" ||
    opt === "vehicle_photo"
  );
}