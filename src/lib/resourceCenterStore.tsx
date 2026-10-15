import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  ResourceCategory,
  ResourceLink,
  ReservationVerification,
  ReservationVerificationStatus,
} from "./resourceCenter";

// Resource Center store — manual verification replaces the former automated
// API integrations (Checkr/Axle/Bonzah). Operators curate resource links
// grouped into categories, and per-reservation verification status is tracked
// against those categories.
//
// This is a standalone context today because the main fleet store module is at
// its size ceiling. It shares the same TENANT_ID / uid conventions and is
// shaped to fold into the main store once that module is split. All records
// are tenant-scoped.

export const TENANT_ID = "tnt_connectpro";

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`;

// ---------------------------------------------------------------------------
// Seed data — 4 default resource categories, all is_active and none required
// by default. 1-2 example resource links under each (placeholder URLs).
// ---------------------------------------------------------------------------

const seedCategories: ResourceCategory[] = [
  {
    id: "rc_driver",
    tenant_id: TENANT_ID,
    name: "Driver / ID Verification",
    description:
      "Run license status and MVR history checks before handing over a vehicle.",
    display_order: 1,
    is_active: true,
  },
  {
    id: "rc_insurance",
    tenant_id: TENANT_ID,
    name: "Insurance Verification",
    description:
      "Confirm the renter's personal auto policy is active and adequate.",
    display_order: 2,
    is_active: true,
  },
  {
    id: "rc_gps",
    tenant_id: TENANT_ID,
    name: "GPS Tracker Companies",
    description: "Install or activate GPS tracking on the rental vehicle.",
    display_order: 3,
    is_active: true,
  },
  {
    id: "rc_roadside",
    tenant_id: TENANT_ID,
    name: "Roadside Assistance",
    description: "Enroll the rental in a roadside assistance program.",
    display_order: 4,
    is_active: true,
  },
];

const seedLinks: ResourceLink[] = [
  // Driver / ID Verification
  {
    id: "rl_driver_1",
    tenant_id: TENANT_ID,
    category_id: "rc_driver",
    name: "License Status Lookup (example)",
    url: "https://example.com/license-lookup",
    description: "State DMV license status check — example placeholder.",
    is_active: true,
    display_order: 1,
  },
  {
    id: "rl_driver_2",
    tenant_id: TENANT_ID,
    category_id: "rc_driver",
    name: "MVR History Report (example)",
    url: "https://example.com/mvr-report",
    description: "Motor vehicle record history — example placeholder.",
    is_active: true,
    display_order: 2,
  },
  // Insurance Verification
  {
    id: "rl_ins_1",
    tenant_id: TENANT_ID,
    category_id: "rc_insurance",
    name: "Carrier Policy Lookup (example)",
    url: "https://example.com/policy-lookup",
    description: "Verify a renter's personal auto policy is active — example.",
    is_active: true,
    display_order: 1,
  },
  {
    id: "rl_ins_2",
    tenant_id: TENANT_ID,
    category_id: "rc_insurance",
    name: "Damage Waiver Purchase (example)",
    url: "https://example.com/damage-waiver",
    description:
      "Offer a paid damage waiver when coverage is inadequate — example.",
    is_active: true,
    display_order: 2,
  },
  // GPS Tracker Companies
  {
    id: "rl_gps_1",
    tenant_id: TENANT_ID,
    category_id: "rc_gps",
    name: "GPS Install Provider (example)",
    url: "https://example.com/gps-install",
    description: "Schedule a GPS tracker install — example placeholder.",
    is_active: true,
    display_order: 1,
  },
  // Roadside Assistance
  {
    id: "rl_road_1",
    tenant_id: TENANT_ID,
    category_id: "rc_roadside",
    name: "Roadside Enrollment (example)",
    url: "https://example.com/roadside",
    description: "Enroll a rental in roadside coverage — example placeholder.",
    is_active: true,
    display_order: 1,
  },
];

// No reservation verifications are seeded — every category starts as
// required: false and not_started for every reservation.
const seedVerifications: ReservationVerification[] = [];

export interface ResourceCenterStore {
  resourceCategories: ResourceCategory[];
  resourceLinks: ResourceLink[];
  reservationVerifications: ReservationVerification[];
  // Categories
  addResourceCategory: (c: ResourceCategory) => void;
  updateResourceCategory: (
    id: string,
    patch: Partial<ResourceCategory>,
  ) => void;
  // Links
  addResourceLink: (l: ResourceLink) => void;
  updateResourceLink: (id: string, patch: Partial<ResourceLink>) => void;
  // Reservation verifications
  // Ensure a verification row exists for a reservation + category (defaults:
  // not_started, required: false). Idempotent.
  ensureReservationVerification: (
    reservationId: string,
    categoryId: string,
  ) => void;
  setReservationVerification: (
    reservationId: string,
    categoryId: string,
    patch: {
      status?: ReservationVerificationStatus;
      required?: boolean;
      verified_by?: string | null;
      verified_at?: string | null;
      notes?: string | null;
    },
  ) => void;
  reservationVerificationsFor: (
    reservationId: string,
  ) => ReservationVerification[];
}

const ResourceCenterContext = createContext<ResourceCenterStore | null>(null);

export function ResourceCenterProvider({ children }: { children: ReactNode }) {
  const [categoryState, setCategories] = useState(seedCategories);
  const [linkState, setLinks] = useState(seedLinks);
  const [verificationState, setVerifications] = useState(seedVerifications);

  const store = useMemo<ResourceCenterStore>(
    () => ({
      resourceCategories: categoryState,
      resourceLinks: linkState,
      reservationVerifications: verificationState,

      addResourceCategory: (c) => setCategories((cs) => [...cs, c]),
      updateResourceCategory: (id, patch) =>
        setCategories((cs) =>
          cs.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        ),

      addResourceLink: (l) => setLinks((ls) => [...ls, l]),
      updateResourceLink: (id, patch) =>
        setLinks((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l))),

      ensureReservationVerification: (reservationId, categoryId) =>
        setVerifications((vs) => {
          if (
            vs.some(
              (v) =>
                v.reservation_id === reservationId &&
                v.category_id === categoryId,
            )
          )
            return vs;
          const entry: ReservationVerification = {
            id: uid("rvf"),
            reservation_id: reservationId,
            category_id: categoryId,
            tenant_id: TENANT_ID,
            status: "not_started",
            required: false,
            verified_by: null,
            verified_at: null,
            notes: null,
          };
          return [...vs, entry];
        }),

      setReservationVerification: (reservationId, categoryId, patch) =>
        setVerifications((vs) => {
          const exists = vs.some(
            (v) =>
              v.reservation_id === reservationId &&
              v.category_id === categoryId,
          );
          if (!exists) {
            const entry: ReservationVerification = {
              id: uid("rvf"),
              reservation_id: reservationId,
              category_id: categoryId,
              tenant_id: TENANT_ID,
              status: patch.status ?? "not_started",
              required: patch.required ?? false,
              verified_by: patch.verified_by ?? null,
              verified_at: patch.verified_at ?? null,
              notes: patch.notes ?? null,
            };
            return [...vs, entry];
          }
          return vs.map((v) =>
            v.reservation_id === reservationId && v.category_id === categoryId
              ? { ...v, ...patch }
              : v,
          );
        }),

      reservationVerificationsFor: (reservationId) =>
        verificationState.filter((v) => v.reservation_id === reservationId),
    }),
    [categoryState, linkState, verificationState],
  );

  return (
    <ResourceCenterContext.Provider value={store}>
      {children}
    </ResourceCenterContext.Provider>
  );
}

export function useResourceCenter() {
  const ctx = useContext(ResourceCenterContext);
  if (!ctx)
    throw new Error(
      "useResourceCenter must be used within ResourceCenterProvider",
    );
  return ctx;
}

export { uid };
