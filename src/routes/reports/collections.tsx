import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import {
  RevenueSummaryReport,
  CollectionsReport,
  OutstandingBalancesReport,
  PaymentArrangementsReport,
  LateFeesReport,
} from "@/pages/reports/FinancialReports";

export const Route = createFileRoute("/reports/collections")({ component: () => <StaffLayout><CollectionsReport /></StaffLayout> });
