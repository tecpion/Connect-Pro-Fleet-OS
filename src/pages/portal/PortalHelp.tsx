// Connect Pro Fleet — Portal Help page (Build #32).
//
// Reuses Build #31 knowledge base. Shows customer-appropriate articles only
// (audience = "customer" or "both"). Staff-only articles are hidden.

import { useState, useMemo } from "react";
import {
  searchKnowledge,
  publishedArticles,
  articleBySlug,
} from "@/lib/supportKnowledgeBase";
import type { KnowledgeArticle } from "@/lib/supportTypes";
import { LifeBuoy, Search, FileText, MessageSquare } from "lucide-react";
import { Link } from "@/lib/router-compat";

const CUSTOMER_SLUGS = new Set([
  "understanding-your-rental",
  "when-your-payment-is-due",
  "how-late-fees-work",
  "security-deposits",
  "requesting-an-extension",
  "requesting-a-return",
  "requesting-a-vehicle-exchange",
  "uploading-your-driver-license",
  "uploading-insurance",
  "understanding-your-balance",
  "viewing-your-rental-agreement",
  "getting-help",
]);

export function PortalHelp() {
  const [query, setQuery] = useState("");

  const customerArticles = useMemo(() => {
    const published = publishedArticles();
    return published.filter(
      (a) =>
        a.audience === "customer" ||
        a.audience === "both" ||
        CUSTOMER_SLUGS.has(a.slug),
    );
  }, []);

  const results = useMemo(() => {
    if (!query.trim()) return customerArticles.slice(0, 6);
    const matches = searchKnowledge(query).matches;
    return matches
      .map((m) => articleBySlug(m.slug))
      .filter(
        (a): a is KnowledgeArticle =>
          !!a &&
          (a.audience === "customer" ||
            a.audience === "both" ||
            CUSTOMER_SLUGS.has(a.slug)),
      );
  }, [query, customerArticles]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Help
        </h1>
        <p className="text-sm text-muted-foreground">
          Find answers to common questions about your rental.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help articles…"
          className="w-full rounded-lg border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Results */}
      {results.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="font-medium text-foreground">
            I couldn't find a help article for that.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try different keywords, or contact us directly.
          </p>
          <Link
            to="/portal/requests"
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <MessageSquare size={16} />
            Contact Support
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {results.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}

      {/* Contact */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <LifeBuoy size={16} />
          <span className="text-sm font-medium text-foreground">
            Still need help?
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Submit a request and our team will get back to you.
        </p>
        <Link
          to="/portal/requests"
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Submit a Request →
        </Link>
      </div>
    </div>
  );
}

function ArticleCard({ article }: { article: KnowledgeArticle }) {
  return (
    <Link
      to={`/portal/help/${article.slug}`}
      className="block rounded-lg border border-border bg-surface p-3 hover:bg-accent"
    >
      <div className="flex items-start gap-2">
        <FileText size={16} className="mt-0.5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">{article.title}</p>
          <p className="text-xs text-muted-foreground">{article.summary}</p>
        </div>
      </div>
    </Link>
  );
}
