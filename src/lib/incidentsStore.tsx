import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  Incident,
  IncidentStatus,
  TrafficViolation,
  ViolationStatus,
} from "./incidents";
import { TENANT_ID } from "./store";

// Incidents & Traffic Violations store — tenant-scoped. Mirrors the
// resource-center store pattern (standalone context because the main fleet
// store module is at its size ceiling). Shares the same TENANT_ID / uid
// conventions and is shaped to fold into the main store once that module is
// split.

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`;

// ---------------------------------------------------------------------------
// Seed data — a few incidents and violations tied to existing vehicles and
// reservations, with one ambiguous violation left pending_match.
// ---------------------------------------------------------------------------

const nowIso = () => new Date().toISOString();
const today = nowIso().slice(0, 10);

export const seedIncidents: Incident[] = [
  {
    id: "inc_1",
    tenant_id: TENANT_ID,
    vehicle_id: "veh_1",
    reservation_id: "res_1",
    incident_type: "damage_dispute",
    description:
      "Customer reported a scratch on the rear bumper at check-in. Disputing responsibility — pre-existing damage noted on checkout inspection.",
    occurred_at: "2026-08-29",
    reported_at: "2026-08-29",
    status: "in_review",
    responsible_party: "renter",
    payment_amount: 125,
    payment_status: "pending",
    insurance_claim_number: null,
    assigned_staff_id: "stf_2",
    photos: [],
    created_at: "2026-08-29T10:00:00Z",
    // Build #52 — incident driver historical authorization. The primary
    // renter was driving; authorization captured AS OF the incident date.
    incident_driver: {
      rental_driver_id: "rdrv_1",
      actual_driver_name: "Hannah Ortiz",
      license_reference: "H841-220-44-9821",
      authorization_at_incident: "primary",
      driver_snapshot: {
        full_name: "Hannah Ortiz",
        role: "primary",
        verification_status: "verified",
        authorization_status: "active",
        license_expiry: "2028-04-12",
      },
    },
    renter_statement:
      "I noticed the scratch when I returned the car. It was not there when I picked it up.",
    police_report_url: null,
    police_report_number: null,
    injuries_reported: "no",
    vehicle_towed: false,
    vehicle_condition_notes: "Minor scratch on rear bumper.",
    linked_damage_claim_id: null,
    post_incident_inspection_id: null,
    incident_location: "Miami, FL",
  },
  {
    id: "inc_2",
    tenant_id: TENANT_ID,
    vehicle_id: "veh_3",
    reservation_id: "res_6",
    incident_type: "breakdown",
    description:
      "Engine warning light came on during rental. Vehicle towed to the yard for diagnosis.",
    occurred_at: "2026-07-19",
    reported_at: "2026-07-19",
    status: "resolved",
    responsible_party: "unknown",
    payment_amount: 0,
    payment_status: "waived",
    insurance_claim_number: null,
    assigned_staff_id: "stf_2",
    photos: [],
    created_at: "2026-07-19T14:00:00Z",
    incident_driver: {
      rental_driver_id: "rdrv_6",
      actual_driver_name: "Ethan Cole",
      license_reference: "E774-330-11-4455",
      authorization_at_incident: "primary",
      driver_snapshot: {
        full_name: "Ethan Cole",
        role: "primary",
        verification_status: "verified",
        authorization_status: "active",
        license_expiry: "2028-09-10",
      },
    },
    renter_statement: null,
    police_report_url: null,
    police_report_number: null,
    injuries_reported: "no",
    vehicle_towed: true,
    vehicle_condition_notes: "Engine warning light; towed for diagnosis.",
    linked_damage_claim_id: null,
    post_incident_inspection_id: null,
    incident_location: "I-95, Fort Lauderdale, FL",
  },
  {
    id: "inc_3",
    tenant_id: TENANT_ID,
    vehicle_id: "veh_5",
    reservation_id: null,
    incident_type: "accident",
    description:
      "Vehicle involved in a collision while in the lot. Third-party driver at fault — insurance claim filed.",
    occurred_at: "2026-08-12",
    reported_at: "2026-08-12",
    status: "open",
    responsible_party: "third_party",
    payment_amount: 2400,
    payment_status: "insurance_claim",
    insurance_claim_number: "CL-2026-00821",
    assigned_staff_id: null,
    photos: ["accident-photo-1", "accident-photo-2"],
    created_at: "2026-08-12T08:30:00Z",
    // Unknown driver — no rental was active. Authorization is "unknown".
    incident_driver: {
      rental_driver_id: null,
      actual_driver_name: "Unknown third-party driver",
      license_reference: null,
      authorization_at_incident: "unknown",
      driver_snapshot: null,
    },
    renter_statement: null,
    police_report_url: "police-report-inc3.pdf",
    police_report_number: "PR-2026-04421",
    injuries_reported: "unknown",
    vehicle_towed: true,
    vehicle_condition_notes: "Front-end collision damage. Vehicle towed.",
    linked_damage_claim_id: null,
    post_incident_inspection_id: null,
    incident_location: "Lot — 123 Fleet St, Miami, FL",
  },
  {
    id: "inc_4",
    tenant_id: TENANT_ID,
    vehicle_id: "veh_2",
    reservation_id: "res_8",
    incident_type: "accident",
    description:
      "Accident during Marcus Delgado's long-term rental. Diego Marin (revoked additional driver) was driving at the time — authorization captured AS OF the incident date (before revocation).",
    occurred_at: "2026-08-18",
    reported_at: "2026-08-18",
    status: "in_review",
    responsible_party: "renter",
    payment_amount: 1800,
    payment_status: "insurance_claim",
    insurance_claim_number: "CL-2026-00915",
    assigned_staff_id: "stf_2",
    photos: ["accident-diego-1"],
    created_at: "2026-08-18T16:00:00Z",
    // Diego Marin was REVOKED on 2026-08-20, but the incident occurred
    // 2026-08-18 — BEFORE the revocation. Historical authorization is
    // "authorized_additional" (he was still authorized at the time). Later
    // revocation does NOT alter this historical fact.
    incident_driver: {
      rental_driver_id: "rdrv_5",
      actual_driver_name: "Diego Marin",
      license_reference: "D661-220-55-9933",
      authorization_at_incident: "authorized_additional",
      driver_snapshot: {
        full_name: "Diego Marin",
        role: "additional",
        verification_status: "verified",
        authorization_status: "active", // was active at incident time
        license_expiry: "2028-03-20",
      },
    },
    renter_statement:
      "Diego was driving when the accident happened. He was on the agreement at the time.",
    police_report_url: null, // intentionally missing — tests "not on file"
    police_report_number: null,
    injuries_reported: "no",
    vehicle_towed: false,
    vehicle_condition_notes: "Side-impact damage to passenger door.",
    linked_damage_claim_id: null,
    post_incident_inspection_id: null,
    incident_location: "US-1, Miami, FL",
  },
];

const seedViolations: TrafficViolation[] = [
  {
    id: "vio_1",
    tenant_id: TENANT_ID,
    vehicle_id: "veh_1",
    reservation_id: "res_1",
    violation_type: "toll",
    violation_date: "2026-08-26",
    fine_amount: 14.5,
    issuing_agency: "Florida Turnpike Enterprise",
    status: "billed",
    renter_billed_amount: 14.5,
    renter_payment_status: "pending",
    notice_document_url: null,
    matched_automatically: true,
    created_at: "2026-08-28T09:00:00Z",
  },
  {
    id: "vio_2",
    tenant_id: TENANT_ID,
    vehicle_id: "veh_2",
    reservation_id: "res_8",
    violation_type: "speeding",
    violation_date: "2026-08-22",
    fine_amount: 180,
    issuing_agency: "City of Miami Police",
    status: "billed",
    renter_billed_amount: 180,
    renter_payment_status: "billed",
    notice_document_url: null,
    matched_automatically: true,
    created_at: "2026-08-27T11:30:00Z",
  },
  {
    id: "vio_3",
    tenant_id: TENANT_ID,
    vehicle_id: "veh_3",
    reservation_id: null,
    violation_type: "parking",
    violation_date: "2026-07-18",
    fine_amount: 65,
    issuing_agency: "Fort Lauderdale Parking Authority",
    status: "pending_match",
    renter_billed_amount: 0,
    renter_payment_status: "pending",
    notice_document_url: null,
    matched_automatically: false,
    created_at: "2026-08-25T16:00:00Z",
  },
];

export interface IncidentsStore {
  incidents: Incident[];
  trafficViolations: TrafficViolation[];
  addIncident: (i: Incident) => void;
  updateIncident: (id: string, patch: Partial<Incident>) => void;
  setIncidentStatus: (id: string, status: IncidentStatus) => void;
  assignIncidentStaff: (id: string, staffId: string | null) => void;
  addTrafficViolation: (v: TrafficViolation) => void;
  updateTrafficViolation: (
    id: string,
    patch: Partial<TrafficViolation>,
  ) => void;
  setViolationStatus: (id: string, status: ViolationStatus) => void;
  matchViolationToReservation: (id: string, reservationId: string) => void;
  // Auto-match a traffic violation to a rental on the same vehicle whose
  // rental period covers the violation date. Returns the matched reservation id
  // or null (caller handles pending_match on ambiguity). Mutates the violation.
  autoMatchViolation: (
    violation: Omit<TrafficViolation, "id" | "created_at" | "tenant_id">,
    reservations: {
      id: string;
      vehicle_id: string;
      start_date: string;
      end_date: string;
    }[],
  ) => {
    reservation_id: string | null;
    matched_automatically: boolean;
    status: ViolationStatus;
  };
}

const IncidentsContext = createContext<IncidentsStore | null>(null);

export function IncidentsProvider({ children }: { children: ReactNode }) {
  const [incidentState, setIncidents] = useState(seedIncidents);
  const [violationState, setViolations] = useState(seedViolations);

  const store = useMemo<IncidentsStore>(
    () => ({
      incidents: incidentState,
      trafficViolations: violationState,

      addIncident: (i) => setIncidents((is) => [i, ...is]),
      updateIncident: (id, patch) =>
        setIncidents((is) =>
          is.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        ),
      setIncidentStatus: (id, status) =>
        setIncidents((is) =>
          is.map((x) => (x.id === id ? { ...x, status } : x)),
        ),
      assignIncidentStaff: (id, staffId) =>
        setIncidents((is) =>
          is.map((x) =>
            x.id === id ? { ...x, assigned_staff_id: staffId } : x,
          ),
        ),

      addTrafficViolation: (v) => setViolations((vs) => [v, ...vs]),
      updateTrafficViolation: (id, patch) =>
        setViolations((vs) =>
          vs.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        ),
      setViolationStatus: (id, status) =>
        setViolations((vs) =>
          vs.map((x) => (x.id === id ? { ...x, status } : x)),
        ),
      matchViolationToReservation: (id, reservationId) =>
        setViolations((vs) =>
          vs.map((x) =>
            x.id === id
              ? {
                  ...x,
                  reservation_id: reservationId,
                  matched_automatically: false,
                  status: "pending_payment",
                }
              : x,
          ),
        ),

      autoMatchViolation: (violation, reservations) => {
        const matches = reservations.filter(
          (r) =>
            r.vehicle_id === violation.vehicle_id &&
            violation.violation_date >= r.start_date &&
            violation.violation_date <= r.end_date,
        );
        if (matches.length === 1) {
          return {
            reservation_id: matches[0].id,
            matched_automatically: true,
            status: "pending_payment" as ViolationStatus,
          };
        }
        // Zero or more than one → never auto-bill an ambiguous match.
        return {
          reservation_id: null,
          matched_automatically: false,
          status: "pending_match" as ViolationStatus,
        };
      },
    }),
    [incidentState, violationState],
  );

  return (
    <IncidentsContext.Provider value={store}>
      {children}
    </IncidentsContext.Provider>
  );
}

export function useIncidents() {
  const ctx = useContext(IncidentsContext);
  if (!ctx)
    throw new Error("useIncidents must be used within IncidentsProvider");
  return ctx;
}

export { uid, TENANT_ID };
