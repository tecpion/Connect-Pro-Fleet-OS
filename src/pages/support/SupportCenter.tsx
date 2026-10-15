// Connect Pro Fleet — Support Center home (Build #31).
//
// The in-app support experience: search help, browse categories, view system
// status, view my support requests, report a problem, and see product
// updates. Tenant-scoped — only the current tenant's tickets are shown.

import { useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { useSupport } from "@/lib/supportStore";
import { can } from "@/lib/permissions";
import { TENANT_ID } from "@/lib/store/ids";
import { PageHeader, SectionCard, EmptyState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ReportProblemDialog } from "@/components/support/ReportProblemDialog";
import {
  searchKnowledge,
  featuredArticles,
  knowledgeCategories,
  articlesByCategory,
} from "@/lib/supportKnowledgeBase";
import {
  buildSystemHealthSnapshot,
  statusLabel,
} from "@/lib/supportSystemHealth";
import {
  publishedReleaseNotes,
  featuredReleaseNotes,
} from "@/lib/supportReleaseNotes";
import { fmtDate } from "@/lib/format";
import {
  Search,
  AlertCircle,
  Activity,
  MessageSquare,
  Sparkles,
  ChevronRight,
} from "lucide-react";

const STATUS_TONE: Record<string, string> = {
  operational: "text-status-available",
  degraded: "text-status-maintenance",
  partial_outage: "text-status-maintenance",
  major_outage: "text-status-out",
  maintenance: "text-status-maintenance",
  unknown: "text-muted-foreground",
};

export default function SupportCenter() {
  const store = useStore();
  const support = useSupport();
  const [query, setQuery] = useState("");
  const [reportOpen, setReportOpen] = useState(false);

  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const overrides = currentStaff?.permission_overrides ?? null;
  const canCreate = can(roleObj, overrides, "support.create");
  const canViewAll = can(
    roleObj,
    overrides,
    "support.view_all_company_tickets",
  );

  const myTickets = useMemo(() => {
    const all = support.getTicketsForTenant(TENANT_ID);
    return canViewAll
      ? all
      : all.filter((t) => t.requester_user_id === store.currentStaffId);
  }, [support, canViewAll, store.currentStaffId]);

  const searchResults = query.trim() ? searchKnowledge(query, 8).matches : [];
  const featured = featuredArticles();
  const categories = knowledgeCategories();
  const health = buildSystemHealthSnapshot();
  const updates = featuredReleaseNotes(3);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Help & Support"
        subtitle="Search help, report a problem, and check system status."
        actions={
          canCreate ? (
            <Button onClick={() => setReportOpen(true)}>
              <AlertCircle size={15} className="mr-1.5" /> Report a problem
            </Button>
          ) : undefined
        }
      />

      {/* Search */}
      <SectionCard>
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search help articles — try 'how do late fees work'..."
            className="pl-10"
            aria-label="Search help"
          />
        </div>
        {query.trim() && (
          <div className="mt-4 space-y-2">
            {searchResults.length === 0 ? (
              <EmptyState
                title="No articles found"
                hint="Try different keywords, browse categories below, or report a problem."
                action={
                  canCreate ? (
                    <Button
                      variant="outline"
                      onClick={() => setReportOpen(true)}
                    >
                      Still need help?
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              searchResults.map((m) => (
                <Link
                  key={m.article_id}
                  to={`/support/articles/${m.slug}`}
                  className="block rounded-md border border-border bg-surface p-3 hover:border-primary/40 hover:bg-surface-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {m.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {m.summary}
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {m.category}
                    </Badge>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}
      </SectionCard>

      {/* System status + My requests */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          title="System status"
          icon={<Activity size={15} className="text-primary" />}
          right={
            <Link
              to="/support/status"
              className="text-xs font-medium text-primary hover:text-primary-press"
            >
              Details →
            </Link>
          }
        >
          <div className="flex items-center justify-between">
            <div>
              <p
                className={`font-display text-lg font-semibold ${STATUS_TONE[health.overall] ?? "text-foreground"}`}
              >
                {statusLabel(health.overall)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {health.monitoring_configured
                  ? "Live monitoring active"
                  : "Live monitoring is not configured in this environment."}
              </p>
            </div>
            {health.active_incidents.length > 0 && (
              <Badge variant="destructive">
                {health.active_incidents.length} active
              </Badge>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="My support requests"
          icon={<MessageSquare size={15} className="text-primary" />}
          right={
            <span className="text-xs font-medium text-muted-foreground">
              {myTickets.length} total
            </span>
          }
        >
          {myTickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You haven't submitted any support requests yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {myTickets.slice(0, 5).map((t) => (
                <li key={t.id}>
                  <Link
                    to={`/support/tickets/${t.id}`}
                    className="flex items-center justify-between rounded-md border border-border bg-surface p-2.5 hover:border-primary/40 hover:bg-surface-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {t.subject}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {t.ticket_number} · {t.status.replace(/_/g, " ")}
                      </p>
                    </div>
                    <ChevronRight
                      size={15}
                      className="shrink-0 text-muted-foreground"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* Popular articles */}
      {featured.length > 0 && !query.trim() && (
        <SectionCard
          title="Popular articles"
          icon={<Sparkles size={15} className="text-primary" />}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {featured.map((a) => (
              <Link
                key={a.id}
                to={`/support/articles/${a.slug}`}
                className="block rounded-md border border-border bg-surface p-3 hover:border-primary/40 hover:bg-surface-2"
              >
                <p className="text-sm font-medium text-foreground">{a.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {a.summary}
                </p>
              </Link>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Browse by category */}
      {!query.trim() && (
        <SectionCard title="Browse by category">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {categories.map((cat) => {
              const count = articlesByCategory(cat).length;
              return (
                <div key={cat}>
                  <p className="text-sm font-medium text-foreground">{cat}</p>
                  <p className="text-xs text-muted-foreground">
                    {count} article{count === 1 ? "" : "s"}
                  </p>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Product updates */}
      {!query.trim() && updates.length > 0 && (
        <SectionCard
          title="Product updates"
          right={
            <Link
              to="/support/updates"
              className="text-xs font-medium text-primary hover:text-primary-press"
            >
              All updates →
            </Link>
          }
        >
          <ul className="space-y-3">
            {updates.map((r) => (
              <li key={r.id} className="flex items-start gap-3">
                <div className="mt-0.5">
                  <Sparkles size={14} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {r.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.summary} · {fmtDate(r.published_at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <ReportProblemDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        routeContext="/support"
        productArea="other"
      />
    </div>
  );
}
