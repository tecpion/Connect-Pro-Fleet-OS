// Connect Pro Fleet — Product Updates / Release Notes page (Build #31).
//
// Shows published release notes newest first, with categories and related
// articles. A compact "What's New" summary leads the page.

import { Link } from "@/lib/router-compat";
import { PageHeader, SectionCard, EmptyState } from "@/components/ui-bits";
import { Badge } from "@/components/ui/badge";
import { publishedReleaseNotes } from "@/lib/supportReleaseNotes";
import { articleBySlug } from "@/lib/supportKnowledgeBase";
import { fmtDate } from "@/lib/format";
import { Sparkles, ArrowLeft } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  new: "New",
  improved: "Improved",
  fixed: "Fixed",
  security: "Security",
  deprecated: "Deprecated",
};

const CATEGORY_TONE: Record<string, string> = {
  new: "bg-status-available/10 text-status-available",
  improved: "bg-primary/10 text-primary",
  fixed: "bg-status-maintenance/10 text-status-maintenance",
  security: "bg-status-out/10 text-status-out",
  deprecated: "bg-muted text-muted-foreground",
};

export default function SupportUpdates() {
  const notes = publishedReleaseNotes();

  return (
    <div className="space-y-6">
      <Link
        to="/support"
        className="inline-flex items-center text-sm text-primary hover:text-primary-press"
      >
        <ArrowLeft size={15} className="mr-1.5" /> Back to Support
      </Link>

      <PageHeader
        title="Product updates"
        subtitle="What's new and changed in Connect Pro Fleet."
      />

      {/* What's New compact panel */}
      {notes.length > 0 && (
        <SectionCard
          title="What's new"
          icon={<Sparkles size={15} className="text-primary" />}
        >
          <div className="space-y-2">
            {notes.slice(0, 3).map((r) => (
              <div key={r.id} className="flex items-start gap-2">
                <Sparkles size={14} className="mt-0.5 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {r.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{r.summary}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {notes.length === 0 ? (
        <EmptyState title="No product updates yet" />
      ) : (
        <div className="space-y-4">
          {notes.map((r) => (
            <SectionCard key={r.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-semibold text-foreground">
                    {r.title}
                  </h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {r.summary}
                  </p>
                </div>
                <div className="text-right">
                  <Badge variant="secondary">v{r.version}</Badge>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {fmtDate(r.published_at)}
                  </p>
                </div>
              </div>

              <ul className="mt-4 space-y-2">
                {r.changes.map((c, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${CATEGORY_TONE[c.category] ?? "bg-muted text-muted-foreground"}`}
                    >
                      {CATEGORY_LABELS[c.category] ?? c.category}
                    </span>
                    <span className="text-sm text-foreground">{c.summary}</span>
                  </li>
                ))}
              </ul>

              {r.related_article_ids.length > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Learn more
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {r.related_article_ids
                      .map((id) => articleBySlug(id))
                      .filter((a): a is NonNullable<typeof a> => Boolean(a))
                      .map((a) => (
                        <Link
                          key={a.id}
                          to={`/support/articles/${a.slug}`}
                          className="text-xs text-primary hover:text-primary-press"
                        >
                          {a.title}
                        </Link>
                      ))}
                  </div>
                </div>
              )}
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}
