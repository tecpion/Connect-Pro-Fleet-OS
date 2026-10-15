// Connect Pro Fleet — Copilot starter prompts (Build #33).
//
// Permission-aware, categorized starter prompts for the Copilot Home experience.
// Only prompts the current user's permissions can support are shown. Each prompt
// maps to a real deterministic intent — no prompt advertises an unsupported
// capability.

import type { CopilotViewerPermissions } from "./copilotTypes";

export interface CopilotPromptCategory {
  label: string;
  prompts: { label: string; query: string }[];
}

/** Build the categorized starter prompts, filtered by the viewer's
 *  permissions. Financial/executive prompts are hidden from staff who lack
 *  those permissions. */
export function buildStarterPrompts(
  perms: CopilotViewerPermissions,
): CopilotPromptCategory[] {
  const categories: CopilotPromptCategory[] = [];

  // Today — always available.
  categories.push({
    label: "Today",
    prompts: [
      {
        label: "What do I need to know today?",
        query: "What do I need to know today?",
      },
      { label: "Who owes money today?", query: "Who owes me money today?" },
      {
        label: "What returns are due today?",
        query: "What returns are due today?",
      },
      {
        label: "What changed since yesterday?",
        query: "What changed since yesterday?",
      },
    ],
  });

  // Collections — financial permission for amounts, but "who is overdue" is
  // available to all (counts only when no financial perm).
  categories.push({
    label: "Collections",
    prompts: [
      {
        label: "Who is overdue right now?",
        query: "Who is overdue right now?",
      },
      ...(perms.canViewFinancials
        ? [
            { label: "Who owes the most?", query: "Who owes the most?" },
            {
              label: "Show oldest overdue accounts",
              query: "Show my oldest overdue accounts.",
            },
          ]
        : []),
      {
        label: "Broken payment arrangements?",
        query: "Which payment arrangements are broken?",
      },
      {
        label: "Collections follow-up priority",
        query: "Who should collections follow up with first?",
      },
    ],
  });

  // Fleet — always available.
  categories.push({
    label: "Fleet",
    prompts: [
      {
        label: "What's available right now?",
        query: "What vehicles are available right now?",
      },
      { label: "What's blocked?", query: "What vehicles are blocked?" },
      {
        label: "Longest idle vehicles?",
        query: "Which vehicles have been idle the longest?",
      },
      {
        label: "No upcoming reservation?",
        query: "What vehicles have no upcoming reservation?",
      },
    ],
  });

  // Business — executive/financial permission.
  if (perms.canViewFinancials || perms.canViewProfitability) {
    categories.push({
      label: "Business",
      prompts: [
        {
          label: "How is the business doing?",
          query: "How is my business doing?",
        },
        {
          label: "Money left on the table?",
          query: "Where am I leaving money on the table?",
        },
        {
          label: "Why is my Health Score what it is?",
          query: "Why is my Health Score what it is?",
        },
        ...(perms.canViewProfitability
          ? [
              {
                label: "Best-performing vehicles?",
                query: "Which vehicles are performing best?",
              },
            ]
          : []),
      ],
    });
  }

  // Operations — always available.
  categories.push({
    label: "Operations",
    prompts: [
      {
        label: "Maintenance attention?",
        query: "What maintenance needs attention?",
      },
      {
        label: "Compliance issues?",
        query: "What compliance issues need attention?",
      },
      {
        label: "Open damage claims?",
        query: "What damage claims are still open?",
      },
      { label: "Overdue tasks?", query: "What tasks are overdue?" },
    ],
  });

  return categories;
}

/** Flat list of starter prompt queries (for backward compatibility). */
export function starterPromptQueries(
  perms: CopilotViewerPermissions,
): { label: string; query: string }[] {
  return buildStarterPrompts(perms).flatMap((c) => c.prompts);
}

// ---------------------------------------------------------------------------
// Page-specific smart suggestions (Build #33, Part XXI).
//
// Each page can preload the Copilot with a small set of suggested questions
// tailored to that page's context. Prompts are filtered by permission so a
// staff viewer never sees financial/profitability suggestions. Only questions
// that map to real deterministic intents are advertised.
// ---------------------------------------------------------------------------

export type CopilotPageArea =
  | "customer"
  | "vehicle"
  | "rental"
  | "payments"
  | "compliance"
  | "executive"
  | "maintenance"
  | "damage"
  | "violations"
  | "tasks"
  | "reports";

/** Build the suggested questions for a given page area, filtered by the
 *  viewer's permissions. Returns an empty array when the area has no
 *  permission-appropriate suggestions. */
export function buildPageSuggestions(
  area: CopilotPageArea,
  perms: CopilotViewerPermissions,
): { label: string; query: string }[] {
  const fin = perms.canViewFinancials;
  const prof = perms.canViewProfitability;
  switch (area) {
    case "customer":
      return [
        {
          label: "What does this customer owe?",
          query: "What does this customer owe?",
        },
        {
          label: "Is this customer overdue?",
          query: "Is this customer overdue?",
        },
        {
          label: "What documents are missing?",
          query: "What documents is this customer missing?",
        },
        {
          label: "Show recent activity",
          query: "Show recent activity for this customer.",
        },
      ];
    case "vehicle":
      return [
        {
          label: "Why is this vehicle unavailable?",
          query: "Why is this vehicle unavailable?",
        },
        {
          label: "How long has it been idle?",
          query: "How long has this vehicle been idle?",
        },
        {
          label: "Show maintenance history",
          query: "Show maintenance history for this vehicle.",
        },
        ...(prof
          ? [
              {
                label: "How profitable is this vehicle?",
                query: "How profitable is this vehicle?",
              },
            ]
          : []),
      ];
    case "rental":
      return [
        {
          label: "What does this rental owe?",
          query: "What does this rental owe?",
        },
        { label: "Is this rental overdue?", query: "Is this rental overdue?" },
        {
          label: "What's blocking this vehicle?",
          query: "What's blocking this vehicle?",
        },
      ];
    case "payments":
      return [
        { label: "Who is overdue?", query: "Who is overdue right now?" },
        ...(fin
          ? [{ label: "Who owes the most?", query: "Who owes the most?" }]
          : []),
        {
          label: "What did we collect today?",
          query: "What did we collect today?",
        },
      ];
    case "compliance":
      return [
        { label: "What expires soon?", query: "What expires soon?" },
        {
          label: "What's blocking vehicles?",
          query: "What compliance issues are blocking vehicles?",
        },
        {
          label: "What should I handle first?",
          query: "What compliance issues should I handle first?",
        },
      ];
    case "executive":
      return [
        ...(fin
          ? [
              {
                label: "Why is my Health Score down?",
                query: "Why is my Business Health Score what it is?",
              },
            ]
          : []),
        ...(fin
          ? [
              {
                label: "Where is money left on the table?",
                query: "Where am I leaving money on the table?",
              },
            ]
          : []),
        { label: "What should I focus on?", query: "What should I focus on?" },
      ];
    case "maintenance":
      return [
        {
          label: "What maintenance needs attention?",
          query: "What maintenance needs attention?",
        },
        {
          label: "What's been down the longest?",
          query: "What vehicles have been down the longest?",
        },
        {
          label: "What maintenance is blocking rentals?",
          query: "What maintenance is blocking rentals?",
        },
      ];
    case "damage":
      return [
        {
          label: "What claims are still open?",
          query: "What damage claims are still open?",
        },
        {
          label: "What's blocked by damage?",
          query: "What vehicles are blocked by damage?",
        },
        ...(fin
          ? [
              {
                label: "How much recovery is outstanding?",
                query: "How much damage recovery is outstanding?",
              },
            ]
          : []),
      ];
    case "violations":
      return [
        {
          label: "What violations are unresolved?",
          query: "What violations are unresolved?",
        },
        {
          label: "Which need recovery?",
          query: "Which violations still need recovery?",
        },
        ...(fin
          ? [
              {
                label: "How much recovery is outstanding?",
                query: "How much violation recovery is outstanding?",
              },
            ]
          : []),
      ];
    case "tasks":
      return [
        { label: "What is overdue?", query: "What tasks are overdue?" },
        { label: "What is unassigned?", query: "What tasks are unassigned?" },
        {
          label: "What do I need to do?",
          query: "What do I personally need to do?",
        },
      ];
    case "reports":
      return [
        ...(fin
          ? [
              {
                label: "How is the business doing?",
                query: "How is my business doing?",
              },
            ]
          : []),
        { label: "What should I focus on?", query: "What should I focus on?" },
      ];
    default:
      return [];
  }
}
