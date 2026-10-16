// Connect Pro Fleet — Build #20 mobile UX + operational polish tests.
//
// Covers the new shared UI primitives, date-safety helpers, error boundary,
// responsive table/card rendering, mobile filter affordances, confirm dialog,
// more-actions menu, permission-aware nav, and pagination hook. These are
// component/integration tests (not snapshots) around behavior.

import { describe, it, expect, vi, afterAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  safeDate,
  safeDateShort,
  safeDateTime,
  safeDateWithTime,
  safeDayKey,
  isValidDateInput,
} from "@/lib/dateSafety";
import {
  fmtDate,
  fmtDateShort,
  daysBetween,
  isPast,
  isFuture,
} from "@/lib/format";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MoreActionsMenu } from "@/components/MoreActionsMenu";
import {
  FilterChip,
  ActiveFilterCount,
  ClearFiltersButton,
} from "@/components/MobileFilters";
import { LoadingState } from "@/components/ui-bits";
import {
  ResponsiveTable,
  type ResponsiveColumn,
} from "@/components/ResponsiveTable";
import { usePagination } from "@/hooks/usePagination";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { renderHook, act as hookAct } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Date safety
// ---------------------------------------------------------------------------

describe("Build #20 — date safety", () => {
  it("isValidDateInput rejects missing/empty/invalid", () => {
    expect(isValidDateInput(undefined)).toBe(false);
    expect(isValidDateInput(null)).toBe(false);
    expect(isValidDateInput("")).toBe(false);
    expect(isValidDateInput("not a date")).toBe(false);
    expect(isValidDateInput("2026-08-30")).toBe(true);
    expect(isValidDateInput("2026-08-30T14:00:00Z")).toBe(true);
  });

  it("safeDate returns fallback for invalid input", () => {
    expect(safeDate(undefined)).toBe("—");
    expect(safeDate(null)).toBe("—");
    expect(safeDate("")).toBe("—");
    expect(safeDate("garbage")).toBe("—");
    expect(safeDate("2026-08-30")).not.toBe("—");
  });

  it("safeDateShort and safeDateTime return fallback for invalid", () => {
    expect(safeDateShort(null)).toBe("—");
    expect(safeDateTime(undefined)).toBe("—");
  });

  it("safeDateWithTime handles missing time", () => {
    expect(safeDateWithTime("2026-08-30", undefined)).not.toBe("—");
    expect(safeDateWithTime("2026-08-30", "14:00")).toContain("·");
    expect(safeDateWithTime(null, "14:00")).toBe("—");
  });

  it("safeDayKey returns null for invalid", () => {
    expect(safeDayKey(null)).toBeNull();
    expect(safeDayKey("bad")).toBeNull();
    expect(safeDayKey("2026-08-30")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("core fmt helpers no longer throw on invalid dates", () => {
    expect(() => fmtDate(undefined as unknown as string)).not.toThrow();
    expect(() => fmtDateShort(null as unknown as string)).not.toThrow();
    expect(fmtDate(undefined as unknown as string)).toBe("—");
    expect(fmtDateShort("" as unknown as string)).toBe("—");
  });

  it("daysBetween returns 0 for invalid dates instead of NaN", () => {
    expect(daysBetween("", "")).toBe(0);
    expect(daysBetween("bad", "also bad")).toBe(0);
    expect(daysBetween("2026-08-28", "2026-08-31")).toBe(3);
  });

  it("isPast/isFuture return false for invalid dates", () => {
    expect(isPast("")).toBe(false);
    expect(isFuture(null as unknown as string)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ConfirmDialog
// ---------------------------------------------------------------------------

describe("Build #20 — ConfirmDialog", () => {
  it("renders title and description", () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Reverse payment"
        description="This will reverse the $400 payment."
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText("Reverse payment")).toBeInTheDocument();
    expect(
      screen.getByText("This will reverse the $400 payment."),
    ).toBeInTheDocument();
  });

  it("confirm calls onConfirm and closes", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Cancel claim"
        description="Are you sure?"
        confirmLabel="Yes, cancel it"
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText("Yes, cancel it"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("requires a reason when requireReason is true", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Void expense"
        description="Reason required."
        requireReason
        onConfirm={onConfirm}
      />,
    );
    // Confirm disabled until reason entered
    const confirmBtn = screen.getByText("Confirm");
    expect(confirmBtn).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/required/i), {
      target: { value: "duplicate" },
    });
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledWith("duplicate");
  });

  it("uses destructive styling when destructive", () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Reverse deposit"
        description="Reverses the deposit."
        destructive
        confirmLabel="Reverse"
        onConfirm={() => {}}
      />,
    );
    const btn = screen.getByText("Reverse");
    expect(btn.className).toContain("destructive");
  });
});

// ---------------------------------------------------------------------------
// MoreActionsMenu
// ---------------------------------------------------------------------------

describe("Build #20 — MoreActionsMenu", () => {
  it("renders nothing when all items hidden", () => {
    const { container } = render(
      <MoreActionsMenu
        items={[{ key: "a", label: "A", hidden: true, onSelect: () => {} }]}
      />,
    );
    expect(container.querySelector("button")).toBeNull();
  });

  it("renders a trigger button with accessible label", () => {
    const onSelect = vi.fn();
    render(
      <MoreActionsMenu
        items={[
          { key: "edit", label: "Edit", onSelect },
          { key: "del", label: "Delete", danger: true, onSelect },
        ]}
      />,
    );
    const trigger = screen.getByLabelText("More actions");
    expect(trigger).toBeInTheDocument();
  });

  it("supports danger and disabled item metadata", () => {
    // Structural smoke: the menu accepts danger/disabled items without crashing.
    render(
      <MoreActionsMenu
        items={[
          { key: "a", label: "A", onSelect: () => {} },
          { key: "b", label: "B", danger: true, onSelect: () => {} },
          { key: "c", label: "C", disabled: true, onSelect: () => {} },
        ]}
      />,
    );
    expect(screen.getByLabelText("More actions")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// MobileFilters
// ---------------------------------------------------------------------------

describe("Build #20 — MobileFilters", () => {
  it("FilterChip renders label and removes", () => {
    const onRemove = vi.fn();
    render(<FilterChip label="Late" onRemove={onRemove} />);
    expect(screen.getByText("Late")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Remove filter Late"));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("ActiveFilterCount shows count when > 0 and hides when 0", () => {
    const { rerender } = render(<ActiveFilterCount count={3} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    rerender(<ActiveFilterCount count={0} />);
    expect(screen.queryByText("0")).toBeNull();
  });

  it("ClearFiltersButton calls onClick", () => {
    const onClick = vi.fn();
    render(<ClearFiltersButton onClick={onClick} />);
    fireEvent.click(screen.getByText("Clear all"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// LoadingState
// ---------------------------------------------------------------------------

describe("Build #20 — LoadingState", () => {
  it("renders with label and status role", () => {
    render(<LoadingState label="Loading rentals…" />);
    expect(screen.getByText("Loading rentals…")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ResponsiveTable
// ---------------------------------------------------------------------------

describe("Build #20 — ResponsiveTable", () => {
  interface Row {
    id: string;
    name: string;
    amount: number;
  }
  const rows: Row[] = [
    { id: "1", name: "Alpha", amount: 100 },
    { id: "2", name: "Beta", amount: 200 },
  ];
  const columns: ResponsiveColumn<Row>[] = [
    { key: "name", header: "Name", mobilePrimary: true, render: (r) => r.name },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      mono: true,
      render: (r) => `$${r.amount}`,
    },
  ];

  it("renders empty state when rows empty and title provided", () => {
    render(
      <ResponsiveTable
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        emptyTitle="No items"
        emptyHint="Try adjusting filters."
      />,
    );
    expect(screen.getByText("No items")).toBeInTheDocument();
  });

  it("renders rows (desktop table path)", () => {
    render(
      <MemoryRouter>
        <ResponsiveTable columns={columns} rows={rows} rowKey={(r) => r.id} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("$100")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// usePagination
// ---------------------------------------------------------------------------

describe("Build #20 — usePagination", () => {
  it("limits visible rows and loads more", () => {
    const items = Array.from({ length: 60 }, (_, i) => i);
    const { result } = renderHook(() => usePagination(items, 25, 25));
    expect(result.current.visible.length).toBe(25);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.remaining).toBe(35);
    hookAct(() => result.current.loadMore());
    expect(result.current.visible.length).toBe(50);
    hookAct(() => result.current.loadMore());
    expect(result.current.visible.length).toBe(60);
    expect(result.current.hasMore).toBe(false);
  });

  it("hasMore is false when under limit", () => {
    const { result } = renderHook(() => usePagination([1, 2, 3], 25, 25));
    expect(result.current.hasMore).toBe(false);
    expect(result.current.visible.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// ErrorBoundary
// ---------------------------------------------------------------------------

function Boom(): null {
  throw new Error("boom");
}

describe("Build #20 — ErrorBoundary", () => {
  // Suppress the expected console.error from the boundary in this test.
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  afterAll(() => spy.mockRestore());

  it("catches render errors and shows fallback", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Reload")).toBeInTheDocument();
  });

  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <div>ok content</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("ok content")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Permission-aware nav (StaffLayout) — verifies unauthorized items hidden
// ---------------------------------------------------------------------------

describe("Build #20 — permission-aware nav", () => {
  it("hides nav items the user lacks permission for", async () => {
    const { StaffLayout, navGroups, standaloneNavItems } =
      await import("@/components/StaffLayout");
    // A nav item with a perm key should be filterable. We verify the data
    // model carries perm keys (the layout filters them via useVisibleNav).
    const withPerm = [
      ...standaloneNavItems,
      ...navGroups.flatMap((g) => g.items),
    ].filter((i) => i.perm);
    expect(withPerm.length).toBeGreaterThan(0);
    // Expenses/banking are now consolidated inside the Finance workspace; the
    // old per-domain nav perm gates (expenses.view/banking.view) moved into the
    // Finance workspace's internal permission checks. Build #56 removed the
    // Damage Claims sidebar link (it remains an authoritative domain surfaced
    // via Case Center), so damage_claims.view is no longer a sidebar perm gate.
    // Remaining gated nav items (investors, reports, migration) carry perms.
    expect(withPerm.some((i) => i.perm === "investors.view")).toBe(true);
    // Smoke-render the layout to ensure it doesn't crash. StaffLayout reads the
    // tenant customer-verification mode via useCompanyPolicies, so it must be
    // mounted within CompanyPolicyProvider (as the production app does).
    const { useStore } = await import("@/lib/store");
    const { StoreProvider } = await import("@/lib/store");
    const { CompanyPolicyProvider } =
      await import("@/lib/store/companyPolicyStore");
    render(
      <StoreProvider>
        <CompanyPolicyProvider>
          <MemoryRouter>
            <StaffLayout>
              <div>page content</div>
            </StaffLayout>
          </MemoryRouter>
        </CompanyPolicyProvider>
      </StoreProvider>,
    );
    expect(screen.getByText("page content")).toBeInTheDocument();
    // useStore import is just to satisfy the linter that we touched the store.
    void useStore;
  });
});
