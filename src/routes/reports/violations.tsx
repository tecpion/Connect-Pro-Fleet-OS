import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import { ViolationsReport } from "@/pages/reports/ViolationsReport";

export const Route = createFileRoute("/reports/violations")({ component: () => <StaffLayout><ViolationsReport /></StaffLayout> });
