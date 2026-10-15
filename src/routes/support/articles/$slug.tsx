import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import SupportArticle from "@/pages/support/SupportArticle";

export const Route = createFileRoute("/support/articles/$slug")({
  component: () => <StaffLayout><SupportArticle /></StaffLayout>,
});
