// Connect Pro Fleet — Copilot answer renderer (Build #29).
//
// Renders a structured CopilotAnswer as scannable cards (never giant prose
// paragraphs): summary line, fact grid, item rows, expandable sources, and
// suggested-action buttons. Financial facts are already permission-gated by the
// handler, so the renderer just displays what it receives.

import { useState } from "react";
import { Link } from "@/lib/router-compat";
import type {
  CopilotAnswer,
  CopilotFact,
  CopilotAnswerItem,
  CopilotSource,
  CopilotSuggestedAction,
  CopilotTaskPreviewItem,
  CopilotDraftMessage,
} from "@/lib/copilotTypes";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/format";

export function AnswerCard({ answer }: { answer: CopilotAnswer }) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">{answer.summary}</p>
      {answer.facts.length > 0 && <FactGrid facts={answer.facts} />}
      {answer.items.length > 0 && <ItemList items={answer.items} />}
      {answer.options && answer.options.length > 0 && (
        <DisambiguationOptions options={answer.options} />
      )}
      {answer.sources.length > 0 && <Sources sources={answer.sources} />}
      {answer.task_preview && answer.task_preview.length > 0 && (
        <TaskPreview preview={answer.task_preview} />
      )}
      {answer.draft_messages && answer.draft_messages.length > 0 && (
        <DraftMessages drafts={answer.draft_messages} />
      )}
      {answer.suggested_actions.length > 0 && (
        <Actions actions={answer.suggested_actions} />
      )}
      {answer.caveats.length > 0 && (
        <ul className="space-y-1">
          {answer.caveats.map((c, i) => (
            <li key={i} className="text-xs text-muted-foreground">
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FactGrid({ facts }: { facts: CopilotFact[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {facts.map((f, i) => (
        <div
          key={i}
          className="rounded-md border border-border bg-muted/30 px-2 py-1.5"
        >
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {f.label}
          </div>
          <div className="text-sm font-semibold text-foreground">
            {formatFactValue(f)}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatFactValue(f: CopilotFact): string {
  if (f.financial && typeof f.value === "number") return fmtMoney(f.value);
  return String(f.value);
}

function ItemList({ items }: { items: CopilotAnswerItem[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((it) => (
        <li
          key={it.id}
          className="rounded-md border border-border bg-background px-3 py-2"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">
                {it.title}
              </div>
              {it.subtitle && (
                <div className="truncate text-xs text-muted-foreground">
                  {it.subtitle}
                </div>
              )}
            </div>
            {it.deep_link && (
              <Link
                to={it.deep_link}
                className="shrink-0 text-xs text-primary hover:underline"
              >
                View
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function DisambiguationOptions({
  options,
}: {
  options: { entity_type: string; entity_id: string; label: string }[];
}) {
  return (
    <ul className="space-y-1.5">
      {options.map((o) => (
        <li key={`${o.entity_type}:${o.entity_id}`}>
          <Link
            to={
              o.entity_type === "customer"
                ? `/customers/${o.entity_id}`
                : o.entity_type === "vehicle"
                  ? `/vehicles/${o.entity_id}`
                  : `/rentals/${o.entity_id}`
            }
            className="block rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/40"
          >
            {o.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Sources({ sources }: { sources: CopilotSource[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        {open
          ? "Hide sources"
          : `Based on ${sources.length} Fleet record${sources.length === 1 ? "" : "s"}`}
      </button>
      {open && (
        <ul className="mt-1 space-y-1">
          {sources.map((s, i) => (
            <li key={i} className="text-xs text-muted-foreground">
              {s.deep_link ? (
                <Link to={s.deep_link} className="text-primary hover:underline">
                  {s.label}
                </Link>
              ) : (
                s.label
              )}
              <span className="ml-1 text-muted-foreground/70">
                · {s.source_module}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Actions({ actions }: { actions: CopilotSuggestedAction[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a, i) =>
        a.deep_link ? (
          <Link
            key={i}
            to={a.deep_link}
            className={cn(
              "rounded-md border border-border px-3 py-1.5 text-xs font-medium",
              "text-foreground hover:bg-muted/40",
            )}
          >
            {a.label}
          </Link>
        ) : (
          <span
            key={i}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground"
          >
            {a.label}
          </span>
        ),
      )}
    </div>
  );
}

/** Build #33 — Create-Task preview. The Copilot never mutates; it shows a
 *  bounded preview the user confirms through the existing Task domain. */
function TaskPreview({ preview }: { preview: CopilotTaskPreviewItem[] }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-2">
      <p className="text-xs font-semibold text-foreground">
        Create {preview.length} {preview.length === 1 ? "task" : "tasks"}?
      </p>
      <ul className="mt-1 space-y-1">
        {preview.map((t) => (
          <li key={t.occurrence_id} className="text-xs text-foreground">
            <span className="font-medium">{t.title}</span>
            {t.deep_link && (
              <Link
                to={t.deep_link}
                className="ml-1 text-primary hover:underline"
              >
                view
              </Link>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Confirm in Tasks to create — Copilot never mutates without approval.
      </p>
    </div>
  );
}

/** Build #33 — Draft customer messages. Review/edit/copy only — never
 *  auto-send. Each draft is isolated (no cross-customer leakage). */
function DraftMessages({ drafts }: { drafts: CopilotDraftMessage[] }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-foreground">
        Draft {drafts.length === 1 ? "reminder" : "reminders"} (review before
        sending)
      </p>
      {drafts.map((d) => (
        <div
          key={d.customer_id}
          className="rounded-md border border-border bg-background px-2 py-1.5"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">
              {d.customer_name}
            </span>
            {d.deep_link && (
              <Link
                to={d.deep_link}
                className="text-[11px] text-primary hover:underline"
              >
                view
              </Link>
            )}
          </div>
          <pre className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">
            {d.body}
          </pre>
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground">
        Drafts only — Copilot never sends without your review.
      </p>
    </div>
  );
}
