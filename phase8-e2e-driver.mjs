#!/usr/bin/env node
// Phase 8 staged E2E driver — runs each stage as a separate HTTP request to the
// sandbox dev server so no single request exceeds the platform deadline.
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

async function post(stage) {
  const url = `${BASE}?stage=${stage}`;
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

(async () => {
  await waitServer();
  const summary = [];
  for (const stage of stages) {
    process.stdout.write(`\n=== ${stage} ===\n`);
    try {
      const { status, body } = await post(stage);
      console.log("HTTP", status);
      console.log(JSON.stringify(body, null, 2).slice(0, 4000));
      summary.push({ stage, status, ran: body?.ran, passed: body?.passed, steps: body?.steps?.length, failed: (body?.steps || []).filter((s) => !s.ok).map((s) => s.step) });
      if (body && body.ran && !body.passed) {
        console.log(`\nStage ${stage} FAILED — stopping.`);
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
  const allPassed = summary.length === stages.length && summary.every((s) => s.passed);
  console.log(`\nPHASE 8 E2E: ${allPassed ? "PASS" : "FAIL"} (${summary.length}/${stages.length} stages)`);
})();
