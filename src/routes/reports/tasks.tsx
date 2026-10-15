import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import {
  RentalActivityReport,
  TasksReport,
  StaffActivityReport,
  InvestorJVReport,
} from "@/pages/reports/OperationsPartnerReports";

export const Route = createFileRoute("/reports/tasks")({ component: () => <StaffLayout><TasksReport /></StaffLayout> });
