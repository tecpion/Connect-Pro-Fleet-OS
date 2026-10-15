import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import HistoricalFinancialsReport from "@/pages/reports/HistoricalFinancialsReport";

export const Route = createFileRoute("/reports/historical-financials")({ component: () => <StaffLayout><HistoricalFinancialsReport /></StaffLayout> });
