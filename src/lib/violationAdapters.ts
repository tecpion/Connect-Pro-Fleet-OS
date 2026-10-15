// Connect Pro Fleet — V1 Tolls & Violations Automation: provider-agnostic
// inbound event contract + adapter interface.
//
// A ViolationProviderEvent is the NORMALIZED shape an external toll/violation
// provider supplies. Provider-specific translation belongs INSIDE the adapter
// layer (a concrete adapter converts a vendor payload into this shape). Fleet
// OS never spreads Advantage/SVR/other vendor schemas across the app.
//
// This is MOCK FRONTEND behavior only. No real provider connection, no
// webhooks, no credentials, no polling jobs (developer-later boundary).
//
// Idempotent by provider + external_event_id.

import type { ViolationType } from "./violationTypes";

// ---------------------------------------------------------------------------
// Provider identity (generic mock ids only — no real vendors)
// ---------------------------------------------------------------------------

export type ViolationProviderId =
  | "mock_toll_provider"
  | "mock_parking_provider"
  | "mock_camera_provider"
  | "mock_full_provider"
  | "other";

export const VIOLATION_PROVIDER_LABELS: Record<ViolationProviderId, string> = {
  mock_toll_provider: "Toll Provider (Mock)",
  mock_parking_provider: "Parking Provider (Mock)",
  mock_camera_provider: "Camera Enforcement (Mock)",
  mock_full_provider: "Full Violation Provider (Mock)",
  other: "Other Provider",
};

/** All mock provider ids. NONE are real vendors. */
export const ALL_VIOLATION_PROVIDER_IDS = Object.keys(
  VIOLATION_PROVIDER_LABELS,
) as ViolationProviderId[];

// ---------------------------------------------------------------------------
// Normalized inbound event
// ---------------------------------------------------------------------------

/** A normalized inbound toll/violation event from any provider adapter. */
export interface ViolationProviderEvent {
  /** External provider's stable event id (idempotency key part). */
  external_event_id: string;
  /** Which mock provider emitted this. */
  provider: ViolationProviderId;
  /** Plate at event time. */
  plate: string | null;
  /** VIN if the provider supplies it. */
  vin: string | null;
  /** When the violation occurred (possession attribution uses this). */
  occurred_at: string;
  /** Normalized violation type. */
  type: ViolationType;
  /** Authority/original amount. */
  amount: number;
  /** Late penalty if applicable. */
  late_amount?: number;
  /** Geographic description. */
  location: string | null;
  /** Issuing authority / agency name. */
  authority: string | null;
  /** Authority notice / citation number. */
  notice_number: string | null;
  /** Authority due date. */
  due_date: string | null;
  /** Document/image reference (provider-side). */
  document_reference: string | null;
  /** Free-form provider metadata (provider-specific, isolated here). */
  metadata?: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Provider adapter contract
// ---------------------------------------------------------------------------

/** Capability flags — different providers expose different functionality. */
export interface ViolationProviderCapabilities {
  supportsTolls: boolean;
  supportsParking: boolean;
  supportsCameraViolations: boolean;
  supportsMovingViolations: boolean;
  supportsViolationImages: boolean;
  supportsDisputeSubmission: boolean;
}

/** Provider-neutral adapter. A concrete adapter (mock now, real later)
 *  translates a vendor payload into ViolationProviderEvent[] + capabilities.
 *  Fleet OS consumes only normalized events. */
export interface ViolationProviderAdapter {
  providerId: ViolationProviderId;
  capabilities: ViolationProviderCapabilities;
  /** Fetch normalized toll events (mock returns canned events). */
  fetchTolls: () => ViolationProviderEvent[];
  /** Fetch normalized non-toll violation events. */
  fetchViolations: () => ViolationProviderEvent[];
  /** Fetch a document reference for an event (mock returns the stored ref). */
  fetchDocument: (externalEventId: string) => string | null;
  /** Acknowledge an event back to the provider (mock no-op). */
  acknowledgeEvent: (externalEventId: string) => void;
  /** Dispute an event with the authority (mock records intent only). */
  disputeEvent: (externalEventId: string, reason: string) => void;
}

// ---------------------------------------------------------------------------
// Mock adapters (canned normalized events). No real API, no credentials.
// ---------------------------------------------------------------------------

const NOW_ISO = "2026-09-27T12:00:00Z";

/** Mock toll provider — tolls only, supports images. */
export const mockTollProviderAdapter: ViolationProviderAdapter = {
  providerId: "mock_toll_provider",
  capabilities: {
    supportsTolls: true,
    supportsParking: false,
    supportsCameraViolations: false,
    supportsMovingViolations: false,
    supportsViolationImages: true,
    supportsDisputeSubmission: true,
  },
  fetchTolls: () => [
    {
      external_event_id: "MTP-TOLL-0001",
      provider: "mock_toll_provider",
      plate: "FL-RT8841",
      vin: null,
      occurred_at: "2026-09-20T10:15:00Z",
      type: "toll",
      amount: 4.75,
      late_amount: 0,
      location: "I-95 Express Lanes MM 8",
      authority: "SunPass",
      notice_number: "SP-9912-0001",
      due_date: "2026-10-20T00:00:00Z",
      document_reference: "mtp://doc/SP-9912-0001",
      metadata: null,
    },
  ],
  fetchViolations: () => [],
  fetchDocument: (id) => `mtp://doc/${id}`,
  acknowledgeEvent: () => {},
  disputeEvent: () => {},
};

/** Mock full provider — tolls + parking + camera + moving, supports images. */
export const mockFullProviderAdapter: ViolationProviderAdapter = {
  providerId: "mock_full_provider",
  capabilities: {
    supportsTolls: true,
    supportsParking: true,
    supportsCameraViolations: true,
    supportsMovingViolations: true,
    supportsViolationImages: true,
    supportsDisputeSubmission: true,
  },
  fetchTolls: () => [
    {
      external_event_id: "MFP-TOLL-0001",
      provider: "mock_full_provider",
      plate: "FL-EV2290",
      vin: null,
      occurred_at: "2026-09-18T08:40:00Z",
      type: "toll",
      amount: 6.5,
      late_amount: 0,
      location: "I-95 Express Lanes MM 14",
      authority: "SunPass",
      notice_number: "SP-4410-8821",
      due_date: "2026-10-18T00:00:00Z",
      document_reference: "mfp://doc/SP-4410-8821",
      metadata: null,
    },
  ],
  fetchViolations: () => [
    {
      external_event_id: "MFP-PARK-0001",
      provider: "mock_full_provider",
      plate: "FL-EV2290",
      vin: null,
      occurred_at: "2026-09-19T22:10:00Z",
      type: "parking_ticket",
      amount: 55,
      late_amount: 0,
      location: "Brickell Ave & SE 10th St",
      authority: "City of Miami Parking Authority",
      notice_number: "MIA-PK-88210",
      due_date: "2026-10-19T00:00:00Z",
      document_reference: "mfp://doc/MIA-PK-88210",
      metadata: null,
    },
    {
      external_event_id: "MFP-CAM-0001",
      provider: "mock_full_provider",
      plate: "FL-TR5520",
      vin: null,
      occurred_at: "2026-09-21T14:25:00Z",
      type: "speed_camera",
      amount: 125,
      late_amount: 0,
      location: "US-1 & SW 104th St",
      authority: "Miami-Dade Photo Enforcement",
      notice_number: "MDPE-99201",
      due_date: "2026-10-21T00:00:00Z",
      document_reference: "mfp://doc/MDPE-99201",
      metadata: null,
    },
  ],
  fetchDocument: (id) => `mfp://doc/${id}`,
  acknowledgeEvent: () => {},
  disputeEvent: () => {},
};

/** Mock camera provider — camera violations only, no images. */
export const mockCameraProviderAdapter: ViolationProviderAdapter = {
  providerId: "mock_camera_provider",
  capabilities: {
    supportsTolls: false,
    supportsParking: false,
    supportsCameraViolations: true,
    supportsMovingViolations: false,
    supportsViolationImages: false,
    supportsDisputeSubmission: false,
  },
  fetchTolls: () => [],
  fetchViolations: () => [
    {
      external_event_id: "MCP-CAM-0001",
      provider: "mock_camera_provider",
      plate: "FL-SV4410",
      vin: null,
      occurred_at: "2026-09-22T17:05:00Z",
      type: "red_light_camera",
      amount: 158,
      late_amount: 0,
      location: "US-1 & SW 152nd St",
      authority: "Miami-Dade Photo Enforcement",
      notice_number: "MDPE-77330",
      due_date: "2026-10-22T00:00:00Z",
      document_reference: null,
      metadata: null,
    },
  ],
  fetchDocument: () => null,
  acknowledgeEvent: () => {},
  disputeEvent: () => {},
};

export const ALL_MOCK_VIOLATION_ADAPTERS: ViolationProviderAdapter[] = [
  mockTollProviderAdapter,
  mockFullProviderAdapter,
  mockCameraProviderAdapter,
];

void NOW_ISO;
