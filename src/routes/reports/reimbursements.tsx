import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import {
  ExpensesReport,
  MissingReceiptsReport,
  ReimbursementsReport,
  BankingReconciliationReport,
  DepositsReport,
} from "@/pages/reports/AccountingReports";

export const Route = createFileRoute("/reports/reimbursements")({ component: () => <StaffLayout><ReimbursementsReport /></StaffLayout> });
