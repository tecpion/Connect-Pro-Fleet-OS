import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import {
  ExpensesRedirect,
  BankingRedirect,
} from "@/components/FinanceRedirects";

export const Route = createFileRoute("/banking")({
  component: () => (
    <StaffLayout>
      <BankingRedirect />
    </StaffLayout>
  ),
});
