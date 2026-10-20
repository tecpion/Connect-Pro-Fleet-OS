// Connect Pro Fleet — Copilot create-reminder / task-prep handler.
//
// "Remind me in 1 hour to call Marcus" / "remind me tomorrow to follow up with
// Sarah" / "create a task to inspect the Jeep" — parses a natural reminder
// request into a bounded TASK PREVIEW the user confirms before the existing
// Task domain creates anything. The Copilot NEVER mutates operational state
// directly: it PREPARES the task (Prepare mode) and asks for approval
// (Execute With Approval), per the existing safeguards.
//
// Parsing is deterministic:
//  - title   : the action after "to" ("call Marcus" → "Call Marcus")
//  - due     : a relative time ("in 1 hour", "in 30 minutes", "tomorrow",
//              "on Friday", "at 3pm") resolved against asOf
//  - entity  : a customer/vehicle mentioned by name (resolved, never guessed)
//
// Uses the AUTHORITATIVE Task domain shape (CopilotTaskPreviewItem). No new
// reminder system. Pure + deterministic; no network, no secrets.

import type {
  CopilotAnswer,
  CopilotSources,
  CopilotViewerPermissions,
  CopilotTaskPreviewItem,
} from "./copilotTypes";
import { baseAnswer } from "./copilotShared";
import { zonedDateTimeParts, getOrgTimezone } from "./timezone";

const DAY = 86_400_000;

/** Parse a relative-time phrase into an ISO due timestamp anchored on asOf.
 *  Returns null when no recognizable relative time is found. Day-of-week and
 *  time-of-day are interpreted in the organization's configured timezone
 *  (`tz`, resolved through `getOrgTimezone` → UTC safe default) so a reminder
 *  for "Friday at 9am" means the org's Friday at 9am, not the server's. */
function parseRelativeDue(query: string, asOf: Date, tz?: string): string | null {
  const z = getOrgTimezone(tz);
  const p = zonedDateTimeParts(asOf, z);
  const q = query.toLowerCase();

  // "in N (hour|hours|minute|minutes|day|days|week|weeks)"
  const rel = q.match(
    /\bin\s+(\d+)\s+(hour|hours|minute|minutes|day|days|week|weeks)\b/,
  );
  if (rel) {
    const n = parseInt(rel[1], 10);
    const unit = rel[2];
    const mult = unit.startsWith("minute")
      ? 60_000
      : unit.startsWith("hour")
        ? 3_600_000
        : unit.startsWith("day")
          ? DAY
          : unit.startsWith("week")
            ? 7 * DAY
            : 0;
    if (mult > 0) return new Date(asOf.getTime() + n * mult).toISOString();
  }

  // "tomorrow" → next calendar day, same time.
  if (/\btomorrow\b/.test(q)) {
    return new Date(asOf.getTime() + DAY).toISOString();
  }

  // "today" / "tonight" → later today.
  if (/\b(today|tonight)\b/.test(q)) {
    return new Date(asOf.getTime() + 4 * 3_600_000).toISOString();
  }

  // "on Friday" / "this Friday" / "next Friday" → the upcoming weekday.
  const weekdays = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const dayMatch = q.match(
    /\b(?:on |this |next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
  );
  if (dayMatch) {
    const target = weekdays.indexOf(dayMatch[1]);
    const cur = p.day === 0 ? 6 : p.day - 1; // JS getDay: 0=Sun..6=Sat
    let diff = (target - cur + 7) % 7;
    if (diff === 0) diff = 7; // same day → next week
    const d = new Date(asOf.getTime() + diff * DAY);
    // 9:00 in the org zone on that future date. Compute the UTC instant for
    // org-local 9am by offsetting from that date's local midnight.
    const dp = zonedDateTimeParts(d, z);
    const wall9 = Date.UTC(dp.year, dp.month - 1, dp.day, 9, 0, 0);
    const back = zonedDateTimeParts(new Date(wall9), z);
    const backUtc = Date.UTC(
      back.year,
      back.month - 1,
      back.day,
      back.hour,
      back.minute,
      back.second,
    );
    return new Date(2 * wall9 - backUtc).toISOString();
  }

  // "at 3pm" / "at 15:00" → today at that org-local time (or tomorrow if past).
  const atMatch = q.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (atMatch) {
    let h = parseInt(atMatch[1], 10);
    const m = atMatch[2] ? parseInt(atMatch[2], 10) : 0;
    const ap = atMatch[3];
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    // Today at org-local h:m.
    const wall = Date.UTC(p.year, p.month - 1, p.day, h, m, 0);
    const back = zonedDateTimeParts(new Date(wall), z);
    const backUtc = Date.UTC(
      back.year,
      back.month - 1,
      back.day,
      back.hour,
      back.minute,
      back.second,
    );
    const d = new Date(2 * wall - backUtc);
    if (d.getTime() <= asOf.getTime()) d.setTime(d.getTime() + DAY);
    return d.toISOString();
  }

  return null;
}

/** Extract the action/title from a reminder phrase.
 *  "remind me in 1 hour to call Marcus" → "Call Marcus"
 *  "create a task to inspect the Jeep"  → "Inspect the Jeep" */
function parseReminderTitle(query: string): string {
  const q = query.trim();
  // Find the action that follows "remind me ... to" — the "to" AFTER the
  // "remind me" clause, not any earlier "to" (e.g. "I want you to remind me").
  const remindMatch = q.match(/\bremind me\b.*?\bto\s+(.+)$/i);
  let action = remindMatch ? remindMatch[1] : "";
  if (!action) {
    // "create a task to <action>"
    const taskMatch = q.match(/\b(?:create|set up|add)\b.*?\bto\s+(.+)$/i);
    action = taskMatch ? taskMatch[1] : "";
  }
  if (!action) {
    // Fallback: last "to <action>" in the sentence.
    const toMatch = q.match(/\bto\s+(.+)$/i);
    action = toMatch ? toMatch[1] : "";
  }
  // Strip trailing time phrases from the action.
  action = action
    .replace(/\b(in|on|at|tomorrow|today|tonight|next|this)\s+.*$/i, "")
    .replace(/\b(in)\s+\d+\s+\w+.*$/i, "")
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(am|pm)?\b.*$/i, "")
    .replace(/\b(on|next|this)\s+\w+day\b.*$/i, "")
    .trim();
  if (!action) {
    // "remind me about X" / "remind me for X"
    const aboutMatch = q.match(/\bremind me (?:about|for)\s+(.+)$/i);
    action = aboutMatch ? aboutMatch[1].trim() : "";
  }
  if (!action) return "Follow up";
  // Capitalize first letter.
  return action.charAt(0).toUpperCase() + action.slice(1);
}

/** Resolve a customer or vehicle mentioned by name in the reminder. Returns the
 *  first unambiguous match (never a guess — null when ambiguous or absent). */
function resolveReminderEntity(
  query: string,
  src: CopilotSources,
): {
  entity_type: string;
  entity_id: string;
  label: string;
  deep_link: string | null;
} | null {
  const s = src.briefing.store;
  const q = query.toLowerCase();

  // Customers by name.
  const custHits = s.customers.filter((c) => {
    const name = s.customerName(c.id).toLowerCase();
    if (!name) return false;
    const parts = name.split(/\s+/).filter((p) => p.length > 2);
    return parts.some((p) => q.includes(p));
  });
  if (custHits.length === 1) {
    const c = custHits[0];
    return {
      entity_type: "customer",
      entity_id: c.id,
      label: s.customerName(c.id),
      deep_link: `/customers/${c.id}`,
    };
  }

  // Vehicles by make/model.
  const vehHits = s.vehicles.filter((v) => {
    const mm = `${v.make} ${v.model}`.toLowerCase();
    return mm.length > 3 && q.includes(v.make.toLowerCase());
  });
  if (vehHits.length === 1) {
    const v = vehHits[0];
    return {
      entity_type: "vehicle",
      entity_id: v.id,
      label: `${v.year} ${v.make} ${v.model}`,
      deep_link: `/vehicles/${v.id}`,
    };
  }

  return null;
}

/** "Remind me in 1 hour to call Marcus" — prepare a task preview for approval. */
export function answerCreateReminder(
  query: string,
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  tz?: string,
): CopilotAnswer {
  const base = baseAnswer("create_reminder", asOf, perms, "derived");
  const title = parseReminderTitle(query);
  const dueIso = parseRelativeDue(query, asOf, tz);
  const entity = resolveReminderEntity(query, src);

  const dueLabel = dueIso
    ? new Date(dueIso).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "soon";

  const preview: CopilotTaskPreviewItem = {
    occurrence_id: `reminder_${title.toLowerCase().replace(/\s+/g, "_")}_${dueIso ?? "nodue"}`,
    title,
    description: `Reminder prepared by Fleet Copilot: ${title}${entity ? ` (linked to ${entity.label})` : ""}.`,
    entity_type: entity?.entity_type ?? "other",
    entity_id: entity?.entity_id ?? "",
    deep_link: entity?.deep_link ?? "/tasks",
  };

  const summary = `I can set that up. I've prepared a reminder to ${title.toLowerCase()} ${dueIso ? `in ${dueLabel}` : ""}${entity ? `, linked to ${entity.label}` : ""}. Want me to create it?`;

  return {
    ...base,
    answer_type: "summary",
    summary,
    facts: [
      { label: "Task", value: title },
      { label: "Due", value: dueLabel },
      ...(entity ? [{ label: "Linked to", value: entity.label }] : []),
    ],
    items: [],
    sources: [],
    task_preview: [preview],
    suggested_actions: [
      {
        label: "Create Task",
        action_type: "create_task",
        deep_link: "/tasks",
      },
    ],
    caveats: [
      "This is a prepared reminder — it is not created until you approve it.",
    ],
  };
}
