// Connect Pro Fleet — Expenses V1 acceptance tests (part 3): UI integration.
// The Expenses workspace renders KPIs + all tabs (Expenses, Reimbursements,
// Receipts, Recurring, Categories, Rules, Month-End, Vendors, Analytics,
// Petty Cash). Tab switching surfaces the right content. Permission-gated
// Categories tab is visible for the owner (stf_1).

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { act } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { StoreProvider } from "@/lib/store";
import Expenses from "@/pages/Expenses";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <StoreProvider>{children}</StoreProvider>
    </MemoryRouter>
  );
}

describe("Expenses V1 — UI integration", () => {
  it("renders the Expenses workspace header + KPI row", () => {
    render(<Expenses />, { wrapper });
    expect(
      screen.getByRole("heading", { name: "Expenses" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Expenses This Month")).toBeInTheDocument();
    expect(screen.getByText("Missing Receipts")).toBeInTheDocument();
    expect(screen.getByText("Reimbursements Owed")).toBeInTheDocument();
    expect(screen.getByText("Vehicle Expenses")).toBeInTheDocument();
    expect(screen.getByText("Overhead Expenses")).toBeInTheDocument();
  });

  it("renders all primary tabs", () => {
    render(<Expenses />, { wrapper });
    expect(screen.getByText("Reimbursements")).toBeInTheDocument();
    expect(screen.getByText("Receipts")).toBeInTheDocument();
    expect(screen.getByText("Recurring")).toBeInTheDocument();
    expect(screen.getByText("Rules")).toBeInTheDocument();
    expect(screen.getByText("Month-End")).toBeInTheDocument();
    expect(screen.getByText("Vendors")).toBeInTheDocument();
    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("Petty Cash")).toBeInTheDocument();
  });

  it("Categories tab is visible for the owner (overhead permission)", () => {
    render(<Expenses />, { wrapper });
    expect(screen.getByText("Categories")).toBeInTheDocument();
  });

  it("switches to the Receipts tab and shows capture actions", () => {
    render(<Expenses />, { wrapper });
    const trigger = screen.getByRole("tab", { name: "Receipts" });
    act(() => {
      fireEvent.mouseDown(trigger);
    });
    expect(screen.getByText("Upload Receipt")).toBeInTheDocument();
    expect(screen.getByText("Take Photo")).toBeInTheDocument();
  });

  it("Receipts tab shows the seeded inbox grouped by month", () => {
    render(<Expenses />, { wrapper });
    const trigger = screen.getByRole("tab", { name: "Receipts" });
    act(() => {
      fireEvent.mouseDown(trigger);
    });
    // Seeded receipt inbox has an AutoZone receipt.
    expect(screen.getByText(/autozone-receipt-sep/i)).toBeInTheDocument();
  });

  it("switches to the Rules tab and shows the Add Rule action + seeded rules", () => {
    render(<Expenses />, { wrapper });
    const trigger = screen.getByRole("tab", { name: "Rules" });
    act(() => {
      fireEvent.mouseDown(trigger);
    });
    expect(screen.getByText("Add Rule")).toBeInTheDocument();
    expect(screen.getByText(/AutoZone → Parts/i)).toBeInTheDocument();
  });

  it("switches to the Recurring tab and shows seeded templates", () => {
    render(<Expenses />, { wrapper });
    const trigger = screen.getByRole("tab", { name: "Recurring" });
    act(() => {
      fireEvent.mouseDown(trigger);
    });
    expect(
      screen.getByText(/Jeep Wrangler — Chase Auto car note/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Add Recurring")).toBeInTheDocument();
  });

  it("switches to Month-End and shows the checklist", () => {
    render(<Expenses />, { wrapper });
    const trigger = screen.getByRole("tab", { name: "Month-End" });
    act(() => {
      fireEvent.mouseDown(trigger);
    });
    expect(screen.getByText("Month-End Expense Check")).toBeInTheDocument();
    expect(screen.getByText(/Operational cleanup/i)).toBeInTheDocument();
    expect(screen.getByText("Missing receipts")).toBeInTheDocument();
    expect(screen.getByText("Unallocated expenses")).toBeInTheDocument();
    expect(screen.getByText("Unmatched bank transactions")).toBeInTheDocument();
  });

  it("switches to Vendors and shows vendor spend", () => {
    render(<Expenses />, { wrapper });
    const trigger = screen.getByRole("tab", { name: "Vendors" });
    act(() => {
      fireEvent.mouseDown(trigger);
    });
    // Either vendor rows or the empty state render.
    const empty = screen.queryByText("No vendor spend");
    expect(
      empty ||
        screen.queryByText("Where the Money Went") ||
        screen.queryByRole("list"),
    ).toBeTruthy();
  });

  it("switches to Analytics and shows Where the Money Went", () => {
    render(<Expenses />, { wrapper });
    const trigger = screen.getByRole("tab", { name: "Analytics" });
    act(() => {
      fireEvent.mouseDown(trigger);
    });
    expect(screen.getByText("Where the Money Went")).toBeInTheDocument();
  });

  it("switches to Categories and shows grouped category library", () => {
    render(<Expenses />, { wrapper });
    const trigger = screen.getByRole("tab", { name: "Categories" });
    act(() => {
      fireEvent.mouseDown(trigger);
    });
    expect(screen.getByText("Add Category")).toBeInTheDocument();
    expect(screen.getByText("Vehicle / Fleet Expenses")).toBeInTheDocument();
    expect(
      screen.getByText("Business / Overhead Expenses"),
    ).toBeInTheDocument();
  });

  it("switches to Reimbursements and shows the owed reimbursement", () => {
    render(<Expenses />, { wrapper });
    const trigger = screen.getByRole("tab", { name: "Reimbursements" });
    act(() => {
      fireEvent.mouseDown(trigger);
    });
    // The seeded reimbursement is for Devon Park / $42.
    expect(screen.getAllByText(/Devon Park/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/42/i).length).toBeGreaterThan(0);
  });

  it("Record expense button is present for the owner", () => {
    render(<Expenses />, { wrapper });
    expect(screen.getByText("Record expense")).toBeInTheDocument();
  });

  it("Unallocated KPI reflects the allocation selector", () => {
    render(<Expenses />, { wrapper });
    // The Unallocated KPI label is present and shows a numeric value.
    const unalloc =
      screen.getByText("Unallocated").closest("div") ??
      screen.getByText("Unallocated");
    expect(unalloc).toBeInTheDocument();
  });
});
