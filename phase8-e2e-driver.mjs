#!/usr/bin/env node
// Phase 8 staged E2E driver — runs each stage as a separate HTTP request to the
// sandbox dev server so no single request exceeds the platform deadline.
// Threads the runId returned by setup-init through every dependent stage.
const BASE = "http://localhost:8080/api/phase8-e2e";
const stages = [
  "setup-init",
  "setup-org-a",
  "setup-org-b",
  "setup-operational",
  "setup-tasks-notifications",
  "setup-config",
  "hydration",
  "isolation",
  "cleanup",
];

async function post(stage, runId) {
  const url = runId
    ? `${BASE}?stage=${stage}&runId=${encodeURIComponent(runId)}`
    : `${BASE}?stage=${stage}`;
  const res = await fetch(url, { method: "POST" });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { status: res.status, body };
}

async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch("http://localhost:8080/");
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function pickRunId(body) {
  return body?.runId ?? body?.result?.runId ?? null;
}

(async () => {
  await waitServer();
  const summary = [];
  let runId = null;
  for (const stage of stages) {
    process.stdout.write(`\n=== ${stage} ===\n`);
    try {
      const { status, body } = await post(stage, runId);
      console.log("HTTP", status);
      console.log(JSON.stringify(body, null, 2).slice(0, 6000));
      const rid = pickRunId(body);
      if (rid) runId = rid;
      const ran = body?.ran;
      const passed = body?.passed;
      const steps = body?.steps ?? [];
      const failed = steps.filter((s) => !s.ok).map((s) => s.step);
      summary.push({ stage, status, ran, passed, steps: steps.length, failed });
      if (ran && !passed) {
        console.log(`\nStage ${stage} FAILED — stopping.`);
        break;
      }
      if (!ran) {
        console.log(`\nStage ${stage} did not run — stopping.`);
        break;
      }
    } catch (e) {
      console.log("ERROR", String(e).slice(0, 500));
      summary.push({ stage, error: String(e).slice(0, 200) });
      break;
    }
  }
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
  const allPassed =
    summary.length === stages.length && summary.every((s) => s.passed);
  console.log(
    `\nPHASE 8 E2E: ${allPassed ? "PASS" : "FAIL"} (${summary.length}/${stages.length} stages)`,
  );
})();
