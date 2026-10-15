// Connect Pro Fleet — Knowledge Base article page (Build #31).
//
// Shows a published article's title, summary, content, related articles, and
// updated date. Article feedback (Helpful / Not Helpful) is recorded in
// session state — no ticket is auto-created. If an article is not found or is
// a draft/archived, the user sees a truthful empty state.

import { useState } from "react";
import { Link, useParams } from "@/lib/router-compat";
import { PageHeader, SectionCard, EmptyState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  articleBySlug,
  recordArticleFeedback,
  resetArticleFeedback,
} from "@/lib/supportKnowledgeBase";
import { fmtDate } from "@/lib/format";
import { useStore } from "@/lib/store";
import { ReportProblemDialog } from "@/components/support/ReportProblemDialog";
import { ArrowLeft, ThumbsUp, ThumbsDown, AlertCircle } from "lucide-react";

export default function SupportArticle() {
  const { slug = "" } = useParams();
  const store = useStore();
  const [feedback, setFeedback] = useState<"helpful" | "not_helpful" | null>(
    null,
  );
  const [reportOpen, setReportOpen] = useState(false);

  const article = articleBySlug(slug);

  if (!article) {
    return (
      <div className="space-y-6">
        <Link
          to="/support"
          className="inline-flex items-center text-sm text-primary hover:text-primary-press"
        >
          <ArrowLeft size={15} className="mr-1.5" /> Back to Support
        </Link>
        <EmptyState
          title="Article not found"
          hint="This article may have been moved or is no longer published."
          action={
            <Button asChild variant="outline">
              <Link to="/support">Browse help</Link>
            </Button>
          }
        />
      </div>
    );
  }

  function handleFeedback(helpful: boolean) {
    recordArticleFeedback(article!.id, helpful, store.currentStaffId);
    setFeedback(helpful ? "helpful" : "not_helpful");
  }

  const related = article.related_article_ids
    .map((id) => articleBySlug(id))
    .filter(
      (a): a is NonNullable<typeof a> => a !== undefined && a.id !== article.id,
    );

  return (
    <div className="space-y-6">
      <Link
        to="/support"
        className="inline-flex items-center text-sm text-primary hover:text-primary-press"
      >
        <ArrowLeft size={15} className="mr-1.5" /> Back to Support
      </Link>

      <PageHeader
        title={article.title}
        subtitle={article.summary}
        actions={<Badge variant="secondary">{article.category}</Badge>}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <article className="lg:col-span-2">
          <SectionCard>
            <div className="prose prose-sm max-w-none">
              {article.body.split("\n\n").map((para, i) => (
                <p
                  key={i}
                  className="mb-3 text-sm leading-relaxed text-foreground"
                >
                  {para}
                </p>
              ))}
            </div>
            <p className="mt-6 border-t border-border pt-3 font-mono text-xs text-muted-foreground">
              Updated {fmtDate(article.updated_at)}
            </p>
          </SectionCard>

          {/* Feedback */}
          <SectionCard title="Was this helpful?" className="mt-6">
            {feedback ? (
              <p className="text-sm text-muted-foreground">
                {feedback === "helpful"
                  ? "Thanks for your feedback."
                  : "Sorry it wasn't helpful. You can report a problem below."}
                {feedback === "not_helpful" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-3"
                    onClick={() => setReportOpen(true)}
                  >
                    <AlertCircle size={14} className="mr-1.5" /> Contact support
                  </Button>
                )}
              </p>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleFeedback(true)}
                >
                  <ThumbsUp size={14} className="mr-1.5" /> Helpful
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleFeedback(false)}
                >
                  <ThumbsDown size={14} className="mr-1.5" /> Not helpful
                </Button>
              </div>
            )}
          </SectionCard>
        </article>

        {/* Related */}
        {related.length > 0 && (
          <SectionCard title="Related articles">
            <ul className="space-y-2">
              {related.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/support/articles/${r.slug}`}
                    className="block rounded-md border border-border bg-surface p-2.5 hover:border-primary/40 hover:bg-surface-2"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {r.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.summary}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>

      <ReportProblemDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        routeContext={`/support/articles/${slug}`}
        productArea={article.product_area}
        initialSubject={`Help article: ${article.title}`}
      />
    </div>
  );
}
