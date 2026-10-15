// Connect Pro Fleet — Copilot intent rules (extracted from copilotResolver).
//
// The ordered list of exact-phrase regex rules that map a normalized query to a
// deterministic intent. Order matters: specific module intents are listed
// BEFORE generic catch-alls (daily_priorities, customer_summary) so a query like
// "What compliance issues need attention?" resolves to compliance_attention,
// not daily_priorities (which also matches the word "attention"). Entity-type
// disambiguation for the generic "what's going on with X" phrase is handled in
// the engine (vehicle vs customer).
//
// Pure + deterministic. No network, no secrets, no LLM.

import type { CopilotIntent } from "./copilotTypes";

export interface IntentRule {
  intent: CopilotIntent;
  patterns: RegExp[];
}

export const INTENT_RULES: IntentRule[] = [
  // Meta (most specific phrases first)
  {
    intent: "help",
    patterns: [
      /\b(what can you (do|help)|help me|what do you do|capabilities)\b/i,
    ],
  },
  // Daily ops
  {
    intent: "end_of_day_recap",
    patterns: [/\b(end of day|recap|how did today|how was today|wrap up)\b/i],
  },
  {
    intent: "morning_ops_briefing",
    patterns: [
      /\b(morning briefing|morning ops|what.*need to know today|what'?s happening today|what should i focus on this morning|give me my morning)\b/i,
      // Build #45 — bare "briefing" / "rundown" / "give me a briefing" /
      // "give me a rundown" route to the operational briefing. These are
      // short conversational triggers; the fuzzy layer also catches them.
      /\bbriefing\b/i,
      /\b(give me a|give me the) (briefing|rundown|run down)\b/i,
      /\b^(briefing|rundown|run down)\b/i,
    ],
  },
  {
    intent: "weekly_review",
    patterns: [
      /\b(weekly (owner )?(report|review|business review)|how did we do this week|this week'?s review|give me a weekly)\b/i,
    ],
  },
  {
    intent: "executive_focus",
    patterns: [
      /\b(what should i (handle|focus on) (first|right now)|biggest issues right now|top priorities|what needs my attention|give me my top priorities)\b/i,
      // Build #43 — fleet-level "rundown" phrases. These MUST be matched here
      // (before the customer_summary catch-all "what's going on with X"),
      // otherwise "What's going on with the fleet?" routes to customer_summary,
      // finds no named entity, and returns the "I couldn't determine which
      // record you mean" fallback — the robotic "I didn't understand" cutoff
      // users hit in Voice Mode. These phrases are explicitly fleet-scoped.
      /\bwhat'?s? going on with the fleet\b/i,
      /\bwhat'?s? happening with the fleet\b/i,
      /\b(give me the|give me a) rundown\b/i,
      /\banything (important|urgent) (going on|happening)\b/i,
      /\bwhat do i need to handle today\b/i,
      /\bwhat do i need to (do|take care of) (today|right now)\b/i,
    ],
  },
  {
    intent: "recent_changes",
    patterns: [
      /\b(what.*changed|recent changes|since yesterday|what'?s new)\b/i,
    ],
  },
  {
    intent: "todays_summary",
    patterns: [
      /\b(today'?s? summary|morning summary|good morning|briefing summary)\b/i,
    ],
  },
  // Rentals (before money so "returns are due today" is not swallowed by money)
  {
    intent: "rentals_returning_today",
    patterns: [
      // Returns DUE today / returning today — present/future, not historical.
      /\b(returns? (due|today)|returning today|due back|drop.?offs? today)\b/i,
      /\breturns?.*due\b/i,
      /\breturns?.*today\b/i,
      /\bhow many returns.*today\b/i,
    ],
  },
  {
    intent: "rentals_starting_today",
    patterns: [
      /\b(rentals? (start|starting)|starting today|pickups? today|checkouts? today)\b/i,
      /\bhow many pickups\b/i,
      /\bpickups? (this week|did (we|i) have|had)\b/i,
    ],
  },
  {
    intent: "overdue_returns",
    patterns: [
      /\b(overdue return|late return|not returned|past.*return)\b/i,
      // Build #47 — rental-overdue phrases must NOT be swallowed by the
      // payment-overdue (overdue_accounts) rule below. These explicitly pair
      // "overdue/late" with "rental/return" so they route to the RENTAL domain.
      /\boverdue\s+(rental|car|vehicle)s?\b/i,
      /\brental\s+(past due|overdue)\b/i,
      /\bvehicle not returned\b/i,
      /\breturns?\s+(overdue|past due|late)\b/i,
      /\bany overdue rentals\b/i,
    ],
  },
  {
    intent: "rental_status",
    patterns: [/\b(rental status|status of rental|what.*rental)\b/i],
  },
  // Payments
  {
    intent: "money_due_today",
    patterns: [
      /\b(who owes|money due|owe me|who needs? to pay)\b/i,
      /\bwhat.*payments?.*due\b/i,
      /\bpayments?.*due today\b/i,
    ],
  },
  {
    intent: "overdue_accounts",
    patterns: [
      /\b(who'?s? late|overdue|already late|past due|behind on|late payments?|hasn'?t paid|unpaid|anybody behind|anyone behind|behind on payments?)\b/i,
    ],
  },
  {
    intent: "customer_balance",
    patterns: [/\b(balance|what.*owe|how much.*owe|outstanding)\b/i],
  },
  {
    intent: "payments_received_today",
    patterns: [
      /\b(payments? received|received today|came in today|collected today)\b/i,
    ],
  },
  {
    intent: "broken_arrangements",
    patterns: [
      /\b(broken arrangement|arrangement.*broke|missed.*arrangement|promise to pay)\b/i,
    ],
  },
  {
    intent: "collections_rank",
    patterns: [
      /\b(collections? follow up|who.*follow up|collect.*first|collections? priority)\b/i,
    ],
  },
  // Vehicles
  {
    intent: "idle_vehicles",
    patterns: [
      /\b(cars? sitting|cars?.*sitting|idle|sitting around|not being used|not making use|not rented|unused|longest.*idle|idle.*longest)\b/i,
    ],
  },
  {
    intent: "fleet_count",
    patterns: [
      /\b(how many (cars?|vehicles?) (do (i|we) (have|own|manage)|are in (my|our|the) fleet)|fleet size|what'?s my fleet size|how many (cars?|vehicles) (currently )?in my fleet)\b/i,
    ],
  },
  {
    intent: "vehicle_unavailable_reason",
    patterns: [
      /\b(why.*(?:can'?t|cannot|unavailable|not available|rent this)|why.*blocked)\b/i,
    ],
  },
  {
    intent: "blocked_vehicles",
    patterns: [
      /\b(blocked vehicles|which.*blocked|can'?t go out|can'?t rent)\b/i,
    ],
  },
  {
    // Fleet-wide utilization — explicit aggregate phrasing. MUST precede the
    // single-vehicle utilization rule so "my utilization" / "utilization rate"
    // / "fleet utilization" routes to the fleet aggregate, not the first
    // matching vehicle. The engine's scope model (copilotScope) downgrades to
    // vehicle_utilization only when a specific vehicle is named.
    intent: "fleet_utilization",
    patterns: [
      /\bmy (fleet )?utilization\b/i,
      /\bmy (fleet )?utilization rate\b/i,
      /\bfleet utilization\b/i,
      /\boverall utilization\b/i,
      /\bcurrent utilization\b/i,
      /\butilization rate\b/i,
      /\bof all of my vehicles\b/i,
      /\bof all (my|the) vehicles\b/i,
    ],
  },
  {
    // Single-vehicle utilization — only reached for a named/resolved vehicle
    // (e.g. "utilization of the Jeep"). A bare "my utilization" is caught by
    // the fleet_utilization rule above.
    intent: "vehicle_utilization",
    patterns: [/\b(utilization|being used|usage)\b/i],
  },
  {
    intent: "popular_vehicle",
    patterns: [
      /\b(most popular|popular vehicle|best (performing|rented)|top (rented|performing)|most rented|rented most|most often rented)\b/i,
    ],
  },
  {
    intent: "vehicle_profitability",
    patterns: [/\b(profit\w*|revenue|made.*money|most money|losing money)\b/i],
  },
  {
    intent: "vehicle_history",
    patterns: [
      /\b(vehicle history|car history|history of (this|the) (car|vehicle))\b/i,
    ],
  },
  {
    intent: "vehicle_status",
    patterns: [/\b(what'?s? going on with (this|the) (car|vehicle))\b/i],
  },
  // Compliance (attention before customer_compliance so "compliance issues need
  // attention" resolves to the fleet compliance_attention intent, not the
  // customer document intent)
  {
    intent: "compliance_attention",
    patterns: [/\b(compliance (issue|attention|problem|issues))\b/i],
  },
  {
    intent: "expiring_documents",
    patterns: [/\b(expir(e|ing|ation)|expire this week|expiring soon)\b/i],
  },
  {
    intent: "blocked_by_compliance",
    patterns: [/\b(blocked by compliance|compliance block)\b/i],
  },
  // Customers (specific history intents before generic summary)
  {
    intent: "customer_rental_history",
    patterns: [
      /\b(rental history|rentals before|previous rentals|rentals? for)\b/i,
    ],
  },
  {
    intent: "customer_damage_history",
    patterns: [/\b(damage (history|before)|had damage|any damage)\b/i],
  },
  {
    intent: "customer_violation_history",
    patterns: [
      /\b(violations? (history|before)|any violations|tickets? before)\b/i,
      /\bviolations? for\b/i,
    ],
  },
  {
    intent: "customer_compliance",
    patterns: [/\b(license valid|insurance valid|documents?)\b/i],
  },
  {
    intent: "customer_payment_status",
    patterns: [/\b(payment status|payment behavior|pay history)\b/i],
  },
  // Build #40 — business summary MUST precede customer_summary (which also
  // matches "tell me about") so "Tell me about my numbers" routes to a real
  // business summary, not a customer fallback.
  {
    intent: "business_summary",
    patterns: [
      /\b(my numbers|how are my numbers|business summary|numbers this week|numbers today|give me a business summary|how'?s business|how is business|tell me about my numbers)\b/i,
    ],
  },
  {
    intent: "customer_summary",
    patterns: [/\b(what'?s? going on with|tell me about|what about)\b/i],
  },
  // Build #52 — defense record intents. Minimal deterministic routing so the
  // Copilot answers factual defense questions even with the LLM flag OFF. Kept
  // intentionally narrow (the LLM handles free phrasing); these cover the
  // common explicit phrasings. Placed BEFORE the generic maintenance_attention
  // + rental_status catch-alls so "maintenance ... at checkout" / "insurance at
  // release" resolve to the historical-snapshot intents, not the generic ones.
  {
    intent: "rentals_missing_license_verification",
    patterns: [
      /\brentals? (missing|without|no) (driver'?s? )?license (verification|verified)\b/i,
      /\b(missing|without) license verification\b/i,
    ],
  },
  {
    intent: "active_rentals_without_checkout",
    patterns: [
      /\b(active )?rentals? (without|missing|no) checkout (inspection|inspection on file)\b/i,
      /\bwhich active rentals (do not|don'?t) have (a |an )?checkout\b/i,
    ],
  },
  {
    intent: "authorized_driver_check",
    patterns: [
      /\b(authorized|additional) (driver|drivers)\b/i,
      /\bdoes .*(rental|agreement) have an? (authorized|additional) (driver|drivers)\b/i,
    ],
  },
  {
    intent: "vehicles_released_with_maintenance_warning",
    patterns: [
      /\b(released|release) (with )?(a )?maintenance (warning|issue)\b/i,
      /\bvehicles? released with maintenance\b/i,
    ],
  },
  {
    intent: "incidents_missing_police_reports",
    patterns: [
      /\bincidents? (missing|without|no) police (report|reports)\b/i,
      /\bwhich incidents (are |are missing|missing) police\b/i,
    ],
  },
  {
    intent: "generate_documentation_package",
    patterns: [
      /\b(create|generate|build|compile) (the |an? )?(documentation|incident|accident) (package|file|report)\b/i,
      /\bdocumentation package\b/i,
    ],
  },
  {
    intent: "rental_defense_record",
    patterns: [
      /\b(rental record|defense record|defence record|defense file)\b/i,
      /\bshow me the (rental record|defense|defence) record\b/i,
    ],
  },
  {
    intent: "driver_authorization_check",
    patterns: [
      /\b(was|is) (this |the |that )?driver (authorized|authorised)\b/i,
      /\bdriver authorization\b/i,
    ],
  },
  {
    intent: "release_insurance_status",
    patterns: [
      /\b(insurance|insurance status) (when|at) (release|checkout|released)\b/i,
      /\bwhat was the insurance status when\b/i,
    ],
  },
  {
    intent: "release_safety_maintenance",
    patterns: [
      /\b(safety|maintenance) (issues?|items?) (when|at) (release|checkout|released)\b/i,
      /\bwhat did we know about (the )?brakes\b/i,
      /\bopen safety maintenance (issues?|at checkout)\b/i,
    ],
  },
  // Case Center (Build #54) — operational case-management questions. Kept
  // narrow (the LLM handles free phrasing); placed before the generic
  // daily_priorities catch-all so "cases need attention" resolves here.
  {
    intent: "cases_need_attention",
    patterns: [
      /\bcases? (need|needs) (my )?(attention|review)\b/i,
      /\bwhat cases (need|should)\b/i,
      /\bwhich cases need\b/i,
    ],
  },
  {
    intent: "unresolved_tolls",
    patterns: [
      /\b(unresolved|open|outstanding) (tolls?|tickets?)\b/i,
      /\bdo i have (any )?(unresolved )?tolls?\b/i,
      /\bany (open )?tolls? (or tickets?)?\b/i,
    ],
  },
  {
    intent: "toll_reimbursements_owed",
    patterns: [
      /\b(customers? )?(owe|owing) (toll )?reimbursements?\b/i,
      /\bwho owes (toll|tolls)\b/i,
      /\btoll reimbursements? (owed|outstanding)\b/i,
    ],
  },
  {
    intent: "disputed_charges",
    patterns: [
      /\b(disputed|dispute) (charges?|cases?)\b/i,
      /\bshow me disputed\b/i,
      /\bwhich charges (are )?disputed\b/i,
    ],
  },
  {
    intent: "unrecovered_amount",
    patterns: [
      /\bhow much is unrecovered\b/i,
      /\bunrecovered (amount|balance)\b/i,
      /\bwhat.*unrecovered\b/i,
    ],
  },
  {
    intent: "deposits_waiting_review",
    patterns: [
      /\bdeposits? (waiting|pending|need) (review|for review)\b/i,
      /\bwhich deposits (are |are waiting|waiting) for review\b/i,
      /\bdeposits? (held|pending) review\b/i,
    ],
  },
  // Maintenance (history before generic maintenance attention)
  {
    intent: "vehicle_maintenance_history",
    patterns: [/\b(maintenance history|service history|repair history)\b/i],
  },
  {
    intent: "maintenance_attention",
    patterns: [/\b(maintenance|work order|in the shop|being serviced)\b/i],
  },
  // Damage
  {
    intent: "open_damage_claims",
    patterns: [
      /\b(open damage|damage claims? (open|still)|active claims?)\b/i,
      /\bdamage claims?\b/i,
    ],
  },
  // Violations ("need attention" — toll domain owns "need review")
  {
    intent: "violation_attention",
    patterns: [
      /\b(tickets? (need|attention)|violations? (need )?attention)\b/i,
    ],
  },
  {
    intent: "unresolved_violations",
    patterns: [
      /\b(unresolved violations?|open violations?|outstanding violations?)\b/i,
    ],
  },
  // Staff / work (my_priorities before daily_priorities so "what should I work on"
  // is not swallowed by daily_priorities' "what.*should i" pattern)
  {
    intent: "my_priorities",
    patterns: [
      /\b(my (work|priorities|tasks)|what should i work on|my tasks)\b/i,
    ],
  },
  {
    intent: "needs_assignment",
    patterns: [/\b(needs? assignment|unassigned|who should handle|assign)\b/i],
  },
  {
    intent: "overdue_tasks",
    patterns: [/\b(overdue tasks?|late tasks?|tasks? (due|overdue))\b/i],
  },
  // Executive (Build #30) — before the generic daily_priorities catch-all.
  {
    intent: "executive_summary",
    patterns: [
      /\b(executive summary|owner'?s? (report|summary)|give me my (executive|owner))\b/i,
    ],
  },
  // Specific health intents before the generic business_health catch-all so
  // "why is my health score..." and "how do I improve..." win over "health score".
  {
    intent: "health_score_explanation",
    patterns: [
      /\b(why is my (health )?score|why.*score.*(down|low|72|78|82)|what.*score.*mean|what'?s hurting my score|what'?s helping my score)\b/i,
    ],
  },
  {
    intent: "improve_health",
    patterns: [
      /\b(how (do|can) i improve.*(health|score)|improve my (health|score))\b/i,
    ],
  },
  {
    intent: "business_health",
    patterns: [
      /\b(business health|how is my (business|company|health)|health score)\b/i,
    ],
  },
  {
    intent: "money_left_on_table",
    patterns: [
      /\b(money (left )?on the table|leaving money|where am i losing|recoverable)\b/i,
    ],
  },
  // Build #40 — business summary rule is declared BEFORE customer_summary
  // (which also matches "tell me about") so business-summary phrasing wins.
  // (See the business_summary rule earlier in this list.)
  {
    intent: "fleet_performance",
    patterns: [
      /\b(underperforming|lowest performing|worst (vehicle|car)|best (vehicle|car)|top (vehicle|car))\b/i,
    ],
  },
  {
    intent: "utilization_explanation",
    patterns: [
      /\b(hurting utilization|why.*utilization (down|low)|utilization explanation)\b/i,
    ],
  },
  {
    intent: "collections_summary",
    patterns: [
      /\b(where is money (outstanding|still)|collections summary|outstanding money)\b/i,
    ],
  },
  // Follow-up meta (Build #33) — before the generic catch-all.
  {
    intent: "why",
    patterns: [
      /^\s*why\??\s*$/i,
      /\bwhy is that\b/i,
      /\bwhy (is|are) (it|that|this)\b/i,
    ],
  },
  // Banking (Build #42) — before the generic daily_priorities catch-all so
  // "which bank transactions need review" resolves to banking_needs_review,
  // not daily_priorities (which also matches "review").
  {
    intent: "banking_needs_review",
    patterns: [
      /\b(bank (transactions?|items?) (need|review|attention)|which.*(bank|transactions?).*(review|attention)|transactions? (still )?need review)\b/i,
      /\bwhat.*(bank|transactions?).*(review|attention)\b/i,
    ],
  },
  {
    intent: "banking_unmatched_out",
    patterns: [
      /\b(money out.*(unmatched|not matched)|unmatched.*(money out|outgoing|expenses?))\b/i,
      /\bhow much.*(money )?out.*(unmatched|not matched)\b/i,
    ],
  },
  {
    intent: "banking_unmatched_in",
    patterns: [
      /\b(money in.*(unmatched|not matched)|unmatched.*(money in|incoming|deposits?|payments?))\b/i,
      /\bhow much.*(money )?in.*(unmatched|not matched)\b/i,
    ],
  },
  {
    intent: "banking_duplicate_expenses",
    patterns: [
      /\b(possible duplicate|duplicate (expense|transaction|charge)s?|double.?count)\b/i,
      /\bare there.*(duplicate|double)\b/i,
    ],
  },
  {
    intent: "banking_statements_attention",
    patterns: [
      /\b(statements? (need|attention|review)|which statements|statement.*(difference|attention))\b/i,
    ],
  },
  {
    intent: "banking_suggested_matches",
    patterns: [
      /\b(suggested (expense )?matches?|transactions? with suggested|which.*(suggested|matches?))\b/i,
      /\bwhich transactions have suggested expense matches\b/i,
    ],
  },
  {
    intent: "product_help_handoff",
    patterns: [
      /\b(how do i (change|set|configure)|where do i (find|change)|how does (the )?late fee (work|setting)|how do late fees work)\b/i,
    ],
  },
  // Booking Requests (Build #62 — CRM handoff). Placed BEFORE the generic
  // daily_priorities catch-all so "booking requests need follow-up" resolves
  // here, not to a generic priorities answer. Narrow + explicit (the LLM layer
  // handles free phrasing); these cover the common deterministic triggers.
  {
    intent: "booking_requests_new",
    patterns: [
      /\bhow many (new )?booking requests?\b/i,
      /\b(new )?booking requests? (do i have|are there)\b/i,
      /\bany new booking requests?\b/i,
    ],
  },
  {
    intent: "booking_requests_follow_up",
    patterns: [
      /\bbooking requests? (need|needs) follow.?up\b/i,
      /\bwhich booking requests? (need|should)\b/i,
      /\brequests? (need|needs) follow.?up\b/i,
    ],
  },
  {
    intent: "booking_requests_waitlisted",
    patterns: [
      /\b(waitlisted|waitlist) (booking )?requests?\b/i,
      /\bdo i have (any )?waitlisted (customers?|requests?)\b/i,
      /\bwho is (waiting|on the waitlist)\b/i,
    ],
  },
  {
    intent: "booking_requests_today",
    patterns: [
      /\brequests? submitted today\b/i,
      /\bbooking requests? today\b/i,
      /\b(new|in) today'?s booking requests?\b/i,
    ],
  },
  {
    intent: "booking_request_summary",
    patterns: [
      /\bbooking request (for|about|details?)\b/i,
      /\btell me about .*'?s booking request\b/i,
      /\bshow me .*'?s booking request\b/i,
    ],
  },
  // Telematics (V1 Telematics Hub) — GPS visibility/monitoring/history/alerts.
  // Placed BEFORE the generic daily_priorities catch-all so "GPS alerts" /
  // "offline devices" resolve here. Narrow + explicit (the LLM layer handles
  // free phrasing); these cover the common deterministic triggers.
  {
    intent: "telematics_offline_devices",
    patterns: [
      /\b(which|what) (gps |telematics )?devices? (are )?offline\b/i,
      /\b(?:gps|telematics) devices? offline\b/i,
      /\bwhich (gps )?devices? (are )?offline\b/i,
      /\boffline (gps |telematics )?devices?\b/i,
    ],
  },
  {
    intent: "telematics_stale_locations",
    patterns: [
      /\b(vehicles?|cars?) (haven'?t|have not) reported (recently|lately)\b/i,
      /\b(stale|outdated) (gps|telematics|location)\b/i,
      /\b(haven'?t|have not) reported (recently|in a while)\b/i,
      /\bwhich vehicles haven'?t reported\b/i,
    ],
  },
  {
    intent: "telematics_rental_alerts",
    patterns: [
      /\b(rented (vehicles?|cars?)) (have |with )?(gps |telematics )?alerts?\b/i,
      /\bwhich rented (vehicles?|cars?) have (gps |telematics )?alerts?\b/i,
      /\brented (vehicles?|cars?) (gps |telematics )?alerts?\b/i,
    ],
  },
  {
    intent: "telematics_no_device",
    patterns: [
      /\b(vehicles?|cars?) (have |with )?no (gps |telematics )?device\b/i,
      /\bwhich (vehicles?|cars?) (have |have )?no (gps|telematics) device\b/i,
      /\bno (gps|telematics) device (installed|connected)\b/i,
      /\b(no gps|without gps)\b/i,
    ],
  },
  {
    intent: "telematics_outside_geofence",
    patterns: [
      /\b(vehicles?|cars?) outside (their|the|its) (allowed )?(area|geofence)\b/i,
      /\boutside (their|the) allowed area\b/i,
      /\bgeofence (violation|breach)\b/i,
      /\b(vehicles?|cars?) (outside|past) (a )?geofence\b/i,
    ],
  },
  // Telematics — vehicle-scoped (entity) intents. The engine intercepts these
  // as raw-query calls (so the handler can resolve the vehicle by plate/unit
  // from the raw query). Deterministic narrow triggers; the LLM handles free
  // phrasing.
  {
    intent: "telematics_vehicle_location",
    patterns: [
      /\bwhere (is|are) (vehicle |the |this )?(fl-?[a-z0-9]+|SV\d+)/i,
      /\bwhere (is|are) (this |the )?(vehicle|car)\b/i,
      /\bwhere'?s (vehicle|the vehicle|car)\b/i,
    ],
  },
  {
    intent: "telematics_trips_for_vehicle",
    patterns: [
      /\b(show|list) trips? for (this |the )?(vehicle|car)\b/i,
      /\btrips? for (this |the )?(vehicle|car)\b/i,
      /\b(vehicle|car) trips? (yesterday|today|this week)\b/i,
    ],
  },
  {
    intent: "telematics_last_seen",
    patterns: [
      /\bwhen was (this |the )?(vehicle|car) last seen\b/i,
      /\blast seen (this |the )?(vehicle|car)\b/i,
      /\bwhen did (this |the )?(vehicle|car) report\b/i,
    ],
  },
  {
    intent: "telematics_summary",
    patterns: [
      /\b(telematics|gps) (for|about|summary|status) (this |the )?(vehicle|car)\b/i,
      /\btell me about (this |the )?(vehicle'?s|car'?s) telematics\b/i,
      /\bshow (me )?(this |the )?(vehicle'?s|car'?s) (telematics|gps)\b/i,
    ],
  },
  // Daily ops — generic catch-all (last; specific attention intents precede it)
  {
    intent: "daily_priorities",
    patterns: [
      /\b(focus|prioriti|attention|start my day|what.*should i)\b/i,
      /\bwhat.*should.*i.*(do|focus|work)/i,
    ],
  },
];
