import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import ReportCenter from "@/pages/reports/ReportCenter";
export const Route = createFileRoute("/reports/$report")({ component: () => <StaffLayout><ReportCenter /></StaffLayout> });
