import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import {
  DailyOperatingReport,
  WeeklyOperatingReport,
} from "@/pages/reports/OperatingReports";

export const Route = createFileRoute("/reports/daily-operating")({ component: () => <StaffLayout><DailyOperatingReport /></StaffLayout> });
