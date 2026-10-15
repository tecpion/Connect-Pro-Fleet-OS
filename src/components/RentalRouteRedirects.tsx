// Connect Pro Fleet — legacy rental/reservation route redirects.
//
// Preserves bookmarks/back-compat: standalone /reservations and /rentals list
// screens have been consolidated into the unified /rental-management workspace.
// These redirects carry over the query string and translate legacy params into
// the Rental Management tab scheme so deep links keep working.
//
//   /reservations             → /rental-management?tab=reservations
//   /reservations?new=1       → /rental-management?tab=reservations&new=1
//   /rentals                  → /rental-management?tab=active
//   /rentals?filter=active    → /rental-management?tab=active&filter=active
//   /rentals?filter=returns_today → /rental-management?tab=returns&filter=returns_today

import { useLocation, Navigate } from "@/lib/router-compat";

function buildTarget(
  tab: "reservations" | "active" | "returns",
  search: string,
): string {
  const sp = new URLSearchParams(search);
  const out = new URLSearchParams();
  out.set("tab", tab);
  // Carry forward deep-link params (filter=, new=, …).
  for (const key of ["filter", "new", "id"]) {
    const v = sp.get(key);
    if (v) out.set(key, v);
  }
  return `/rental-management?${out.toString()}`;
}

/** /reservations → Rental Management → Reservations tab. */
export function ReservationsRedirect() {
  const { search } = useLocation();
  return <Navigate to={buildTarget("reservations", search)} replace />;
}

/** /rentals → Rental Management → Active tab (or Returns when filter implies
 *  a returns-today deep link). */
export function RentalsRedirect() {
  const { search } = useLocation();
  const sp = new URLSearchParams(search);
  // /rentals?filter=returns_today maps to the Returns tab.
  const tab: "active" | "returns" =
    sp.get("filter") === "returns_today" ? "returns" : "active";
  return <Navigate to={buildTarget(tab, search)} replace />;
}
