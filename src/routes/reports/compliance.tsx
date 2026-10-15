import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import { ComplianceReport } from "@/pages/reports/ComplianceReport";

export const Route = createFileRoute("/reports/compliance")({ component: () => <StaffLayout><ComplianceReport /></StaffLayout> });
