// Connect Pro Fleet — Copilot full page (Build #29).
// Route /copilot — full-screen conversational experience sharing CopilotPanel.

import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { PageHeader } from "@/components/ui-bits";

export default function CopilotPage() {
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <PageHeader title="Fleet Copilot" subtitle="Your operational assistant" />
      <div className="flex-1 overflow-hidden rounded-lg border border-border">
        <CopilotPanel embedded />
      </div>
    </div>
  );
}
