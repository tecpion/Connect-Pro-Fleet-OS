// Connect Pro Fleet — Copilot company-intent dispatch (extracted from engine).
//
// Maps a company-wide (non-entity) intent to its handler. Extracted into a
// focused module so the engine file stays maintainable. Pure delegation — no
// new logic, no new store. Each case calls the existing authoritative handler.

import type {
  CopilotAnswer,
  CopilotIntent,
  CopilotViewerPermissions,
} from "./copilotTypes";
import type { CopilotEngineContext } from "./copilotEngine";
import { unsupportedAnswer } from "./copilotResolver";
import { baseAnswer } from "./copilotShared";
import {
  answerMoneyDueToday,
  answerOverdueAccounts,
  answerPaymentsReceivedToday,
  answerBrokenArrangements,
  answerRentalsStartingToday,
  answerRentalsReturningToday,
  answerOverdueReturns,
} from "./copilotMoneyRentalHandlers";
import {
  answerIdleVehicles,
  answerBlockedVehicles,
  answerMaintenanceAttention,
  answerOpenDamageClaims,
  answerComplianceAttention,
  answerExpiringDocuments,
  answerViolationAttention,
  answerUnresolvedViolations,
} from "./copilotVehicleHandlers";
import { answerFleetCount } from "./copilotFleetCountHandler";
import { answerFleetUtilization } from "./copilotFleetUtilizationHandler";
import { answerPopularVehicle } from "./copilotPopularVehicleHandler";
import { answerEarningsSummary } from "./copilotEarningsHandler";
import { answerDepositSummary } from "./copilotDepositHandler";
import { answerOpenTasks } from "./copilotTaskHandler";
import { answerFinanceOverview } from "./copilotFinanceOverviewHandler";
import {
  answerActiveRentals,
  answerHistoricalReturns,
  answerVehicleAdditions,
} from "./copilotRentalHistoryHandlers";
import { answerCreateReminder } from "./copilotReminderHandler";
import {
  answerDailyPriorities,
  answerTodaysSummary,
  answerRecentChanges,
  answerMyPriorities,
  answerNeedsAssignment,
  answerOverdueTasks,
  answerEndOfDayRecap,
} from "./copilotDailyHandlers";
import {
  answerExecutiveSummary,
  answerBusinessHealth,
  answerHealthScoreExplanation,
  answerMoneyLeftOnTable,
  answerFleetPerformance,
  answerUtilizationExplanation,
  answerCollectionsSummary,
} from "./copilotExecutiveHandlers";
import {
  answerMorningOpsBriefing,
  answerExecutiveFocus,
} from "./copilotLaunchBriefing";
import { answerCollectionsRank } from "./copilotLaunchCollections";
import { answerImproveHealth, answerWeeklyReview } from "./copilotLaunchHealth";
import {
  answerBankingNeedsReview,
  answerBankingUnmatchedOut,
  answerBankingUnmatchedIn,
  answerBankingDuplicateExpenses,
  answerBankingStatementsAttention,
  answerBankingSuggestedMatches,
} from "./copilotBankingHandlers";
import {
  answerRentalsMissingLicenseVerification,
  answerActiveRentalsWithoutCheckout,
  answerVehiclesReleasedWithMaintenanceWarning,
  answerIncidentsMissingPoliceReports,
} from "./copilotDefenseHandlers";
import {
  answerCasesNeedAttention,
  answerUnresolvedTolls,
  answerTollReimbursementsOwed,
  answerDisputedCharges,
  answerUnrecoveredAmount,
  answerDepositsWaitingReview,
} from "./copilotCaseHandlers";
import {
  answerBookingRequestsNew,
  answerBookingRequestsFollowUp,
  answerBookingRequestsWaitlisted,
  answerBookingRequestsToday,
  answerBookingRequestSummary,
} from "./copilotBookingHandlers";
import {
  answerTelematicsOfflineDevices,
  answerTelematicsStaleLocations,
  answerTelematicsRentalAlerts,
  answerTelematicsNoDevice,
  answerTelematicsOutsideGeofence,
  answerTelematicsVehicleLocation,
  answerTelematicsTripsForVehicle,
  answerTelematicsLastSeen,
  answerTelematicsSummaryFallback,
} from "./copilotTelematicsHandlers";
import {
  answerVerificationBlocked,
  answerVerificationNeedsReview,
  answerVerificationExpiredLicenses,
  answerVerificationUsage,
  answerVerificationCustomerSummary,
  answerVerificationCustomerSummaryFallback,
  answerVerificationNoHistory,
} from "./copilotVerificationHandlers";
import {
  answerTollsUnmatched,
  answerViolationsNeedReview,
  answerTollsForCustomerRental,
  answerTollPossessionAtEvent,
  answerTollsUnrecovered,
  answerTollsPaidThisMonth,
  answerTollsRecoveredAmount,
  answerViolationsDueThisWeek,
  answerCustomersDisputedViolations,
} from "./copilotTollHandlers";

/** Dispatch a company-wide (non-entity) intent to its handler. */
export function dispatchCompanyIntent(
  intent: CopilotIntent,
  ctx: CopilotEngineContext,
): CopilotAnswer {
  switch (intent) {
    case "daily_priorities":
      return answerDailyPriorities(ctx.src, ctx.asOf, ctx.perms, ctx.staffId);
    case "todays_summary":
      return answerTodaysSummary(ctx.src, ctx.asOf, ctx.perms, ctx.staffId);
    case "recent_changes":
      return answerRecentChanges(
        ctx.src,
        ctx.asOf,
        ctx.perms,
        ctx.allowedLocationIds ?? [],
        (ctx as { rawQuery?: string }).rawQuery ?? "",
        (ctx as { tz?: string }).tz,
      );
    case "end_of_day_recap":
      return answerEndOfDayRecap(
        ctx.src,
        ctx.asOf,
        ctx.perms,
        (ctx as { tz?: string }).tz,
      );
    case "morning_ops_briefing":
      return answerMorningOpsBriefing(
        ctx.src,
        ctx.asOf,
        ctx.perms,
        ctx.staffId,
      );
    case "executive_focus":
      return answerExecutiveFocus(ctx.src, ctx.asOf, ctx.perms);
    case "weekly_review":
      return answerWeeklyReview(ctx.src, ctx.asOf, ctx.perms);
    case "money_due_today":
      return answerMoneyDueToday(ctx.src, ctx.asOf, ctx.perms);
    case "overdue_accounts":
      return answerOverdueAccounts(ctx.src, ctx.asOf, ctx.perms);
    case "payments_received_today":
      return answerPaymentsReceivedToday(ctx.src, ctx.asOf, ctx.perms);
    case "broken_arrangements":
      return answerBrokenArrangements(ctx.src, ctx.asOf, ctx.perms);
    case "collections_rank":
      return answerCollectionsRank(ctx.src, ctx.asOf, ctx.perms);
    case "rentals_starting_today":
      return answerRentalsStartingToday(ctx.src, ctx.asOf, ctx.perms);
    case "rentals_returning_today":
      return answerRentalsReturningToday(ctx.src, ctx.asOf, ctx.perms);
    case "overdue_returns":
      return answerOverdueReturns(ctx.src, ctx.asOf, ctx.perms);
    case "idle_vehicles":
      return answerIdleVehicles(ctx.src, ctx.asOf, ctx.perms);
    case "fleet_count":
      return answerFleetCount(ctx.src, ctx.asOf, ctx.perms);
    case "fleet_utilization":
      return answerFleetUtilization(ctx.src, ctx.asOf, ctx.perms);
    case "finance_overview":
      return answerFinanceOverview("", ctx.src, ctx.asOf, ctx.perms);
    case "active_rentals":
      return answerActiveRentals(ctx.src, ctx.asOf, ctx.perms);
    case "historical_returns":
      return answerHistoricalReturns("", ctx.src, ctx.asOf, ctx.perms);
    case "vehicle_additions":
      return answerVehicleAdditions("", ctx.src, ctx.asOf, ctx.perms);
    case "earnings_summary":
      return answerEarningsSummary("", ctx.src, ctx.asOf, ctx.perms);
    case "deposit_summary":
      return answerDepositSummary("", ctx.src, ctx.asOf, ctx.perms);
    case "open_tasks":
      return answerOpenTasks(ctx.src, ctx.asOf, ctx.perms);
    case "create_reminder":
      // Engine intercepts first-turn with the raw query; this is the fallback
      // for re-dispatch (no query context) — returns a prep prompt.
      return answerCreateReminderFallback(ctx.asOf, ctx.perms);
    case "popular_vehicle":
      return answerPopularVehicle("", ctx.src, ctx.asOf, ctx.perms);
    case "blocked_vehicles":
      return answerBlockedVehicles(ctx.src, ctx.asOf, ctx.perms);
    case "maintenance_attention":
      return answerMaintenanceAttention(ctx.src, ctx.asOf, ctx.perms);
    case "open_damage_claims":
      return answerOpenDamageClaims(ctx.src, ctx.asOf, ctx.perms);
    case "compliance_attention":
      return answerComplianceAttention(ctx.src, ctx.asOf, ctx.perms);
    case "expiring_documents":
      return answerExpiringDocuments(ctx.src, ctx.asOf, ctx.perms);
    case "violation_attention":
      return answerViolationAttention(ctx.src, ctx.asOf, ctx.perms);
    case "unresolved_violations":
      return answerUnresolvedViolations(ctx.src, ctx.asOf, ctx.perms);
    case "my_priorities":
      return answerMyPriorities(ctx.src, ctx.asOf, ctx.perms, ctx.staffId);
    case "needs_assignment":
      return answerNeedsAssignment(ctx.src, ctx.asOf, ctx.perms);
    case "overdue_tasks":
      return answerOverdueTasks(ctx.src, ctx.asOf, ctx.perms);
    case "executive_summary":
      return answerExecutiveSummary(ctx.src, ctx.asOf, ctx.perms);
    case "business_health":
      return answerBusinessHealth(ctx.src, ctx.asOf, ctx.perms);
    case "health_score_explanation":
      return answerHealthScoreExplanation(ctx.src, ctx.asOf, ctx.perms);
    case "improve_health":
      return answerImproveHealth(ctx.src, ctx.asOf, ctx.perms);
    case "money_left_on_table":
      return answerMoneyLeftOnTable(ctx.src, ctx.asOf, ctx.perms);
    case "fleet_performance":
      return answerFleetPerformance(ctx.src, ctx.asOf, ctx.perms);
    case "utilization_explanation":
      return answerUtilizationExplanation(ctx.src, ctx.asOf, ctx.perms);
    case "collections_summary":
      return answerCollectionsSummary(ctx.src, ctx.asOf, ctx.perms);
    case "banking_needs_review":
      return answerBankingNeedsReview(ctx.src, ctx.asOf, ctx.perms);
    case "banking_unmatched_out":
      return answerBankingUnmatchedOut(ctx.src, ctx.asOf, ctx.perms);
    case "banking_unmatched_in":
      return answerBankingUnmatchedIn(ctx.src, ctx.asOf, ctx.perms);
    case "banking_duplicate_expenses":
      return answerBankingDuplicateExpenses(ctx.src, ctx.asOf, ctx.perms);
    case "banking_statements_attention":
      return answerBankingStatementsAttention(ctx.src, ctx.asOf, ctx.perms);
    case "banking_suggested_matches":
      return answerBankingSuggestedMatches(ctx.src, ctx.asOf, ctx.perms);
    case "business_summary":
      // "Tell me about my numbers this week" → weekly review composer (real
      // business summary, not a fallback).
      return answerWeeklyReview(ctx.src, ctx.asOf, ctx.perms);
    // Build #52 — defense fleet-wide list intents.
    case "rentals_missing_license_verification":
      return answerRentalsMissingLicenseVerification(ctx);
    case "active_rentals_without_checkout":
      return answerActiveRentalsWithoutCheckout(ctx);
    case "vehicles_released_with_maintenance_warning":
      return answerVehiclesReleasedWithMaintenanceWarning(ctx);
    case "incidents_missing_police_reports":
      return answerIncidentsMissingPoliceReports(ctx);
    // Build #54 — Case Center fleet-wide intents.
    case "cases_need_attention":
      return answerCasesNeedAttention(ctx);
    case "unresolved_tolls":
      return answerUnresolvedTolls(ctx);
    case "toll_reimbursements_owed":
      return answerTollReimbursementsOwed(ctx);
    case "disputed_charges":
      return answerDisputedCharges(ctx);
    case "unrecovered_amount":
      return answerUnrecoveredAmount(ctx);
    case "deposits_waiting_review":
      return answerDepositsWaitingReview(ctx);
    // Build #62 — Booking Request (CRM handoff) intents.
    case "booking_requests_new":
      return answerBookingRequestsNew(ctx.src, ctx.asOf, ctx.perms);
    case "booking_requests_follow_up":
      return answerBookingRequestsFollowUp(ctx.src, ctx.asOf, ctx.perms);
    case "booking_requests_waitlisted":
      return answerBookingRequestsWaitlisted(ctx.src, ctx.asOf, ctx.perms);
    case "booking_requests_today":
      return answerBookingRequestsToday(ctx.src, ctx.asOf, ctx.perms);
    case "booking_request_summary":
      // Re-dispatch fallback — the engine intercepts first-turn with the raw
      // query; on re-dispatch there is no name context, so prompt the user.
      return answerBookingRequestSummaryFallback(ctx.asOf, ctx.perms);
    // V1 Telematics Hub — fleet-wide (non-entity) telematics intents. These
    // answer from normalized Fleet telematics records (no provider secrets).
    // Vehicle-scoped telematics intents (location/trips/last-seen/summary) are
    // handled as raw-query intercepts in the engine + LLM dispatch.
    case "telematics_offline_devices":
      return answerTelematicsOfflineDevices(ctx.src, ctx.asOf, ctx.perms);
    case "telematics_stale_locations":
      return answerTelematicsStaleLocations(ctx.src, ctx.asOf, ctx.perms);
    case "telematics_rental_alerts":
      return answerTelematicsRentalAlerts(ctx.src, ctx.asOf, ctx.perms);
    case "telematics_no_device":
      return answerTelematicsNoDevice(ctx.src, ctx.asOf, ctx.perms);
    case "telematics_outside_geofence":
      return answerTelematicsOutsideGeofence(ctx.src, ctx.asOf, ctx.perms);
    // V1 Telematics — vehicle-scoped intents. The engine's ENTITY_INTENTS set
    // does not include these, so they reach the company dispatch. We resolve
    // the vehicle by plate/unit from the raw query, which the caller threads
    // onto ctx as `rawQuery` (CopilotPanel sets it). When absent (re-dispatch),
    // the handler falls back to a graceful "tell me which vehicle" prompt.
    case "telematics_vehicle_location":
      return answerTelematicsVehicleLocation(
        ctx.src,
        ctx.asOf,
        ctx.perms,
        (ctx as { rawQuery?: string }).rawQuery,
      );
    case "telematics_trips_for_vehicle":
      return answerTelematicsTripsForVehicle(
        ctx.src,
        ctx.asOf,
        ctx.perms,
        (ctx as { rawQuery?: string }).rawQuery,
      );
    case "telematics_last_seen":
      return answerTelematicsLastSeen(
        ctx.src,
        ctx.asOf,
        ctx.perms,
        (ctx as { rawQuery?: string }).rawQuery,
      );
    case "telematics_summary":
      return answerTelematicsSummaryFallback(ctx.asOf, ctx.perms);
    // V1 Customer Verification — optional paid third-party checks. Copilot
    // distinguishes optional vs required; never reports an optional unrun check
    // as a missing requirement.
    case "verification_blocked":
      return answerVerificationBlocked(ctx.src, ctx.asOf, ctx.perms);
    case "verification_needs_review":
      return answerVerificationNeedsReview(ctx.src, ctx.asOf, ctx.perms);
    case "verification_expired_licenses":
      return answerVerificationExpiredLicenses(ctx.src, ctx.asOf, ctx.perms);
    case "verification_usage":
      return answerVerificationUsage(
        ctx.src,
        ctx.asOf,
        ctx.perms,
        (ctx as { tz?: string }).tz,
      );
    case "verification_no_history":
      return answerVerificationNoHistory(ctx.src, ctx.asOf, ctx.perms);
    case "verification_customer_summary":
      // The engine threads the raw query onto ctx as `rawQuery` (CopilotPanel
      // sets it). The handler matches a customer by name from the query text.
      // When absent (re-dispatch), it prompts the user to restate the name.
      return answerVerificationCustomerSummary(
        ctx.src,
        ctx.asOf,
        ctx.perms,
        (ctx as { rawQuery?: string }).rawQuery,
      );
    // V1 Tolls & Violations Automation — Copilot uses possession matching.
    // Responsibility is NEVER inferred without possession evidence. Reads
    // normalized Fleet records — never raw provider secrets/credentials.
    case "tolls_unmatched":
      return answerTollsUnmatched(ctx.src, ctx.asOf, ctx.perms);
    case "violations_need_review":
      return answerViolationsNeedReview(ctx.src, ctx.asOf, ctx.perms);
    case "tolls_for_customer_rental":
      return answerTollsForCustomerRental(
        ctx.src,
        ctx.asOf,
        ctx.perms,
        (ctx as { rawQuery?: string }).rawQuery,
      );
    case "toll_possession_at_event":
      return answerTollPossessionAtEvent(
        ctx.src,
        ctx.asOf,
        ctx.perms,
        (ctx as { rawQuery?: string }).rawQuery,
      );
    case "tolls_unrecovered":
      return answerTollsUnrecovered(ctx.src, ctx.asOf, ctx.perms);
    case "tolls_paid_this_month":
      return answerTollsPaidThisMonth(
        ctx.src,
        ctx.asOf,
        ctx.perms,
        (ctx as { tz?: string }).tz,
      );
    case "tolls_recovered_amount":
      return answerTollsRecoveredAmount(ctx.src, ctx.asOf, ctx.perms);
    case "violations_due_this_week":
      return answerViolationsDueThisWeek(ctx.src, ctx.asOf, ctx.perms);
    case "customers_disputed_violations":
      return answerCustomersDisputedViolations(ctx.src, ctx.asOf, ctx.perms);
    default:
      return unsupportedAnswer(intent, ctx.asOf, ctx.perms);
  }
}

/** Fallback for booking_request_summary when re-dispatched without the raw
 *  query (e.g. time-modifier re-run). Prompts the user to restate the name. */
function answerBookingRequestSummaryFallback(
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("booking_request_summary", asOf, perms, "derived");
  return {
    ...base,
    answer_type: "fallback",
    summary:
      "I can look up a booking request by name. Tell me the customer's name — for example, 'Tell me about Marcus's booking request.'",
    facts: [],
    items: [],
    sources: [],
    suggested_actions: [
      {
        label: "Open Booking Requests",
        action_type: "view_booking_requests",
        deep_link: "/rental-management?tab=booking",
      },
    ],
    caveats: [
      "A booking request is intake — not a reservation until staff convert it.",
    ],
  };
}

/** Fallback for create_reminder when re-dispatched without the raw query
 *  (e.g. time-modifier re-run). Prompts the user to restate the reminder. */
function answerCreateReminderFallback(
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("create_reminder", asOf, perms, "derived");
  return {
    ...base,
    answer_type: "summary",
    summary:
      "I can prepare a reminder or task for you. Tell me what you'd like to be reminded about and when — for example, 'Remind me in 1 hour to call Marcus.'",
    facts: [],
    items: [],
    sources: [],
    suggested_actions: [],
    caveats: [
      "Reminders are prepared first and created only after you approve them.",
    ],
  };
}
