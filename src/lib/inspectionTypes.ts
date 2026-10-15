// Connect Pro Fleet — inspection / driver / addon domain types.
// Extracted from types.ts to keep each module focused and under the line limit.

export interface DamageFlag {
  angle: string;
  confidence: number;
  region: { x: number; y: number; w: number; h: number };
  note: string;
}

export interface Inspection {
  id: string;
  reservation_id: string;
  vehicle_id: string;
  inspection_type: "checkout" | "checkin";
  photos: string[];
  odometer_reading: number;
  fuel_level: number;
  damage_notes: string;
  damage_detected: boolean;
  damage_ai_confidence: number;
  damage_ai_flagged_regions: DamageFlag[];
  inspector_signature_url: string | null;
  timestamp: string;
  tenant_id: string;
}

export interface Driver {
  id: string;
  reservation_id: string;
  full_name: string;
  license_number: string;
  license_state: string;
  license_expiry: string;
  verification_status: "pending" | "verified" | "failed";
  tenant_id: string;
}

export interface Addon {
  id: string;
  reservation_id: string;
  addon_type:
    | "extra_driver"
    | "delivery"
    | "prepaid_fuel"
    | "child_seat"
    | "gps_unit"
    | "insurance_waiver";
  price: number;
  quantity: number;
  tenant_id: string;
}
