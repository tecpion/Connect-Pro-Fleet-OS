// Connect Pro Fleet — Incidents & Violations combined workspace entry.
//
// This route renders the combined IncidentsViolationsWorkspace: one workspace
// with two authoritative tabs (Incidents → incidentsStore; Traffic Violations
// → rich violation store). The separate /violations route remains for the
// standalone rich Violations Center. No authoritative domain logic changes.

import IncidentsViolationsWorkspace from "./incidents/workspace/IncidentsViolationsWorkspace";

export default function Incidents() {
  return <IncidentsViolationsWorkspace />;
}
