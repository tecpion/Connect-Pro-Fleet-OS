// Connect Pro Fleet — Copilot defense handlers barrel (Build #52).
//
// Re-exports the fleet-wide list handlers + entity-scoped handlers + the
// legal-conclusion guard. Kept as a single import surface for the dispatch
// wiring so the dispatch modules don't import from two files.

export {
  answerRentalsMissingLicenseVerification,
  answerActiveRentalsWithoutCheckout,
  answerVehiclesReleasedWithMaintenanceWarning,
  answerIncidentsMissingPoliceReports,
  getDefenseSources,
  defenseFallback,
} from "./copilotDefenseListHandlers";

export {
  answerAuthorizedDriverCheck,
  answerGenerateDocumentationPackage,
  answerRentalDefenseRecord,
  answerDriverAuthorizationCheck,
  answerReleaseInsuranceStatus,
  answerReleaseSafetyMaintenance,
  isLegalConclusionQuery,
  answerLegalConclusionRefusal,
} from "./copilotDefenseEntityHandlers";
