// Connect Pro Fleet — Contextual Help drawer (Build #31).
//
// Reusable HelpButton opens a right-side drawer showing recommended articles
// for the current route, a search box, a link to Report a Problem, and a link
// to My Support Requests. On mobile it is full-screen. Pages pass route +
// product area + optional article IDs / search keywords.

import { useState } from "react";
import { Link } from "@/lib/router-compat";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HelpCircle, Search, AlertCircle, MessageSquare } from "lucide-react";
import {
  articlesForRoute,
  searchKnowledge,
  articleBySlug,
} from "@/lib/supportKnowledgeBase";
import { ReportProblemDialog } from "./ReportProblemDialog";

export interface ContextualHelpProps {
  route: string;
  productArea?: string;
  articleSlugs?: string[];
  searchKeywords?: string[];
}

export function ContextualHelp({
  route,
  productArea,
  articleSlugs = [],
  searchKeywords = [],
}: ContextualHelpProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [reportOpen, setReportOpen] = useState(false);

  const recommended = [
    ...articleSlugs
      .map((s) => articleBySlug(s))
      .filter((a): a is NonNullable<typeof a> => Boolean(a)),
    ...articlesForRoute(route),
  ].filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i);

  const results = query.trim() ? searchKnowledge(query, 5).matches : [];

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="sm" aria-label="Help">
            <HelpCircle size={16} />
            <span className="ml-1.5 hidden sm:inline">Help</span>
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Help</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-6">
            <div className="relative">
              <Search
                size={15}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search help articles..."
                className="pl-8"
              />
            </div>

            {query.trim() ? (
              <div className="space-y-2">
                {results.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    I couldn't find a help article for that.
                  </p>
                ) : (
                  results.map((m) => (
                    <Link
                      key={m.article_id}
                      to={`/support/articles/${m.slug}`}
                      onClick={() => setOpen(false)}
                      className="block rounded-md border border-border bg-surface p-3 hover:border-primary/40 hover:bg-surface-2"
                    >
                      <p className="text-sm font-medium text-foreground">
                        {m.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {m.summary}
                      </p>
                    </Link>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Recommended for this page
                  </p>
                  {recommended.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No specific articles for this page.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {recommended.map((a) => (
                        <Link
                          key={a.id}
                          to={`/support/articles/${a.slug}`}
                          onClick={() => setOpen(false)}
                          className="block rounded-md border border-border bg-surface p-2.5 hover:border-primary/40 hover:bg-surface-2"
                        >
                          <p className="text-sm font-medium text-foreground">
                            {a.title}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {a.summary}
                          </p>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {searchKeywords.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Related topics
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {searchKeywords.map((k) => (
                        <button
                          key={k}
                          onClick={() => setQuery(k)}
                          className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-foreground hover:border-primary/40"
                        >
                          {k}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2 border-t border-border pt-4">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setReportOpen(true)}
              >
                <AlertCircle size={15} className="mr-2" />
                Report a problem
              </Button>
              <Link to="/support" onClick={() => setOpen(false)}>
                <Button variant="ghost" className="w-full justify-start">
                  <MessageSquare size={15} className="mr-2" />
                  My support requests
                </Button>
              </Link>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ReportProblemDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        routeContext={route}
        productArea={productArea}
      />
    </>
  );
}
