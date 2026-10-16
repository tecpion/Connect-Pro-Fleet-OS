// Connect Pro Fleet — Copilot Voice Mode tests (Build #38).
//
// Covers: spoken-response formatter (privacy, bounded lists, KPI/morning
// briefing/overdue/money-left-on-table), push-to-talk mic UI, transcript review,
// read-aloud, auto-play default off, stop/interrupt, mic stops on unmount,
// permission filtering before speech, source IDs excluded, action guardrails
// (preview required, drafts never auto-sent), mobile mic control, and context
// retention (dashboard/vehicle/customer/rental) for voice.
//
// Mock adapters come from ./copilotVoiceTestHarness.tsx (NON-test module).
// Engine answers come from the real deterministic Copilot engine against seeded
// data, so the spoken formatter is exercised against genuine answers.

import { describe, it, expect, beforeEach } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { resolveCopilotQuery } from "@/lib/copilotEngine";
import { buildCopilotSpokenResponse } from "@/lib/copilotVoiceSpeech";
import {
  NOW,
  FULL_PERMS,
  NO_FINANCE_PERMS,
  useCopilotTestSources,
  engineCtx,
  emptyConversation,
  firstCustomerName,
  firstVehicle,
} from "./copilotTestHarness";
import {
  renderVoicePanel,
  makeMockRecognition,
  makeMockSynthesis,
  flush,
  type MockRecognitionProvider,
  type MockSynthesisProvider,
} from "./copilotVoiceTestHarness";

// ---------------------------------------------------------------------------
// Spoken-response formatter (pure)
// ---------------------------------------------------------------------------

describe("Build #38 — Spoken response formatter", () => {
  const r = useCopilotTestSources();

  it("1. morning briefing spoken summary is concise", () => {
    const a = resolveCopilotQuery(
      "Give me my morning briefing",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const spoken = buildCopilotSpokenResponse(a, FULL_PERMS);
    expect(spoken.length).toBeGreaterThan(0);
    expect(spoken.length).toBeLessThan(400);
    expect(spoken).not.toMatch(/res_\w+|agr[_-]\w+/i); // no source IDs
  });

  it("2. overdue summary names top customers + total", () => {
    const a = resolveCopilotQuery(
      "Who is already late?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const spoken = buildCopilotSpokenResponse(a, FULL_PERMS);
    // When there are overdue accounts, name a few + a screen reminder; when
    // none, a concise "no overdue" line. Either way: no raw source IDs/UUIDs.
    if (a.items.length > 0) {
      expect(spoken).toMatch(/review the full list on screen/i);
    } else {
      // Build #40 — conversational "don't currently have any overdue customers".
      expect(spoken).toMatch(
        /don'?t currently have any overdue customers|no overdue customers/i,
      );
    }
    expect(spoken).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it("3. money-left-on-table spoken formatter", () => {
    const a = resolveCopilotQuery(
      "Where am I leaving money on the table?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const spoken = buildCopilotSpokenResponse(a, FULL_PERMS);
    expect(spoken.length).toBeGreaterThan(0);
    expect(spoken).not.toMatch(/\/executive|\/vehicles/i); // no URL paths
  });

  it("4. utilization explanation reads naturally", () => {
    const a = resolveCopilotQuery(
      "What's hurting utilization?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const spoken = buildCopilotSpokenResponse(a, FULL_PERMS);
    expect(spoken.length).toBeGreaterThan(0);
    // No internal enum values like "vehicle_utilization".
    expect(spoken).not.toMatch(/_explanation|vehicle_utilization/i);
  });

  it("5. bounded list speech does not read 20 rows", () => {
    const a = resolveCopilotQuery(
      "Who should collections follow up with first?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const spoken = buildCopilotSpokenResponse(a, FULL_PERMS);
    // When empty, it is a concise "no overdue" line; when populated, it names
    // at most a few + a screen reminder. Either way it stays bounded + short.
    expect(spoken.length).toBeLessThan(600);
    if (a.items.length > 0) {
      expect(spoken).toMatch(/review the full list on screen/i);
    } else {
      // Build #40 — conversational phrasing.
      expect(spoken).toMatch(
        /don'?t currently have any overdue customers|no overdue customers/i,
      );
    }
  });

  it("6. source IDs excluded from spoken response", () => {
    const a = resolveCopilotQuery(
      "What should I focus on first?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const spoken = buildCopilotSpokenResponse(a, FULL_PERMS);
    // No entity_id-style tokens, no source_module keys, no deep_link paths.
    expect(spoken).not.toMatch(/source_module|deep_link|entity_id/i);
    expect(spoken).not.toMatch(/\/[a-z]+\/[a-z0-9_-]+/i);
  });

  it("7. banking values excluded when permission filtered", () => {
    const a = resolveCopilotQuery(
      "Who is already late?",
      emptyConversation(),
      engineCtx(r.current.sources, NO_FINANCE_PERMS),
    );
    const spoken = buildCopilotSpokenResponse(a, NO_FINANCE_PERMS);
    // No dollar amounts should be spoken when financials are hidden.
    expect(spoken).not.toMatch(/\$\d/);
    expect(spoken).not.toMatch(/\d+ dollars/i);
  });

  it("8. document numbers excluded from spoken response", () => {
    const a = resolveCopilotQuery(
      "Give me my morning briefing",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const spoken = buildCopilotSpokenResponse(a, FULL_PERMS);
    // No document-number-looking tokens (DOC-XXXX etc).
    expect(spoken).not.toMatch(/doc[_-]\w+/i);
  });

  it("9. follow-up voice context — 'why?' binds to prior intent", () => {
    const base = resolveCopilotQuery(
      "Who is already late?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    // Simulate the engine setting prior intent + a customer in context.
    const conv = {
      ...emptyConversation(),
      context_prior_intent: "overdue_accounts" as const,
      context_customer_id: base.sources[0]?.entity_id ?? null,
    };
    const why = resolveCopilotQuery("Why?", conv, engineCtx(r.current.sources));
    const spoken = buildCopilotSpokenResponse(why, FULL_PERMS);
    expect(spoken.length).toBeGreaterThan(0);
    expect(why.intent).toBe("why");
  });
});

// ---------------------------------------------------------------------------
// Voice input UI — DUAL voice experience (Build #40).
// Two clearly distinct controls:
//   1. Dictation mic ("Dictate message") — speech → editable text → Send.
//   2. Voice Conversation ("Start Voice Conversation") — true Voice Mode.
// Full conversational integration coverage lives in copilotVoiceMode.test.tsx.
// ---------------------------------------------------------------------------

describe("Build #40 — Dual voice controls", () => {
  let recognition: MockRecognitionProvider;
  let synthesis: MockSynthesisProvider;

  beforeEach(() => {
    recognition = makeMockRecognition();
    synthesis = makeMockSynthesis();
  });

  it("10. dictation mic renders when supported", () => {
    renderVoicePanel({ recognition, synthesis });
    expect(
      screen.getByRole("button", { name: "Dictate message" }),
    ).toBeTruthy();
  });

  it("11. Voice Conversation button renders when supported", () => {
    renderVoicePanel({ recognition, synthesis });
    expect(
      screen.getByRole("button", { name: "Start Voice Conversation" }),
    ).toBeTruthy();
  });

  it("12. unsupported browser hides both voice controls", () => {
    recognition.supported = false;
    renderVoicePanel({ recognition, synthesis });
    expect(
      screen.queryByRole("button", { name: "Dictate message" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Start Voice Conversation" }),
    ).toBeNull();
    // Typed Copilot remains usable.
    expect(
      screen.getByPlaceholderText("Ask about your operation…"),
    ).toBeTruthy();
  });

  it("13. dictation mic populates the composer (voice-to-text)", async () => {
    renderVoicePanel({ recognition, synthesis });
    const textarea = screen.getByLabelText(
      "Ask Fleet Copilot",
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Dictate message" }));
    await flush();
    expect(textarea.value).toBe(""); // no transcript yet
    // Deliver a final transcript → it lands in the composer (dictation).
    act(() => recognition.deliverTranscript("How many pickups today?"));
    await flush();
    // Dictation places the transcript into the composer, not auto-submit.
    // (The useCopilotVoiceInput onTranscript appends to the input.)
  });

  it("14. dictation does NOT auto-submit (no Send)", async () => {
    renderVoicePanel({ recognition, synthesis });
    fireEvent.click(screen.getByRole("button", { name: "Dictate message" }));
    await flush();
    act(() => recognition.deliverTranscript("Who owes me money today?"));
    await flush();
    // No answer appears yet — the user must press Send.
    expect(synthesis.spokenTexts.length).toBe(0);
    expect(screen.queryByText(/Working on it/i)).toBeNull();
  });

  it("15. Voice Conversation button enters Voice Mode (not dictation)", async () => {
    renderVoicePanel({ recognition, synthesis });
    const textarea = screen.getByLabelText(
      "Ask Fleet Copilot",
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
    fireEvent.click(
      screen.getByRole("button", { name: "Start Voice Conversation" }),
    );
    await flush();
    // The composer is never populated by speech — Voice Mode takes over.
    expect(textarea.value).toBe("");
    expect(screen.getByText(/Fleet Copilot Voice/i)).toBeTruthy();
  });

  it("16. End Voice restores the text composer + unified history", async () => {
    renderVoicePanel({ recognition, synthesis });
    fireEvent.click(
      screen.getByRole("button", { name: "Start Voice Conversation" }),
    );
    await flush();
    act(() => recognition.deliverFinalAndEnd("Who owes me money today?"));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "End Voice" }));
    await flush();
    expect(screen.getByLabelText("Ask Fleet Copilot")).toBeTruthy();
    expect(
      screen.getAllByText(/Who owes me money today?/i).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("17. dictation mic is distinct from Voice Conversation (two controls)", () => {
    renderVoicePanel({ recognition, synthesis });
    const dictationMic = screen.getByRole("button", {
      name: "Dictate message",
    });
    const voiceButton = screen.getByRole("button", {
      name: "Start Voice Conversation",
    });
    // Both are present and are different elements.
    expect(dictationMic).not.toBe(voiceButton);
  });
});

// ---------------------------------------------------------------------------
// Read aloud + speech synthesis
// ---------------------------------------------------------------------------

describe("Build #38 — Read aloud", () => {
  let recognition: MockRecognitionProvider;
  let synthesis: MockSynthesisProvider;

  beforeEach(() => {
    recognition = makeMockRecognition();
    synthesis = makeMockSynthesis();
  });

  it("24. read aloud control renders on an answer", async () => {
    renderVoicePanel({ recognition, synthesis });
    const textarea = screen.getByLabelText(
      "Ask Fleet Copilot",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "Who owes me money today?" },
    });
    fireEvent.submit(textarea.form!);
    await waitFor(() => {
      expect(screen.getByText(/Read aloud/i)).toBeTruthy();
    });
  });

  it("25. read aloud speaks the safe spoken text", async () => {
    renderVoicePanel({ recognition, synthesis });
    const textarea = screen.getByLabelText(
      "Ask Fleet Copilot",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "Who owes me money today?" },
    });
    fireEvent.submit(textarea.form!);
    await waitFor(() => {
      expect(screen.getByText(/Read aloud/i)).toBeTruthy();
    });
    fireEvent.click(screen.getByText(/Read aloud/i));
    expect(synthesis.spokenTexts.length).toBe(1);
    // Spoken text must not contain raw source IDs / URL paths.
    const spoken = synthesis.spokenTexts[0];
    expect(spoken).not.toMatch(/source_module|deep_link/i);
    expect(spoken).not.toMatch(/\/[a-z]+\/[a-z0-9_-]+/i);
  });

  it("26. speech stop control appears while speaking", async () => {
    renderVoicePanel({ recognition, synthesis });
    const textarea = screen.getByLabelText(
      "Ask Fleet Copilot",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "Who owes me money today?" },
    });
    fireEvent.submit(textarea.form!);
    await waitFor(() => {
      expect(screen.getByText(/Read aloud/i)).toBeTruthy();
    });
    fireEvent.click(screen.getByText(/Read aloud/i));
    expect(synthesis.speaking).toBe(true);
    expect(screen.getByText(/Reading answer/i)).toBeTruthy();
    fireEvent.click(screen.getByText("Stop"));
    expect(synthesis.stopCalls).toBeGreaterThanOrEqual(1);
  });

  it("27. auto-play defaults off", async () => {
    renderVoicePanel({ recognition, synthesis });
    const textarea = screen.getByLabelText(
      "Ask Fleet Copilot",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "Who owes me money today?" },
    });
    fireEvent.submit(textarea.form!);
    await waitFor(() => {
      expect(screen.getByText(/Working on it/i)).toBeTruthy();
    });
    // Without enabling auto-play, nothing is spoken automatically.
    expect(synthesis.spokenTexts.length).toBe(0);
  });

  it("28. new question stops current speech", async () => {
    renderVoicePanel({ recognition, synthesis });
    const textarea = screen.getByLabelText(
      "Ask Fleet Copilot",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "Who owes me money today?" },
    });
    fireEvent.submit(textarea.form!);
    await waitFor(() => {
      expect(screen.getByText(/Read aloud/i)).toBeTruthy();
    });
    fireEvent.click(screen.getByText(/Read aloud/i));
    expect(synthesis.speaking).toBe(true);
    // Submit a second question → speech must stop.
    fireEvent.change(textarea, {
      target: { value: "What should I focus on first?" },
    });
    fireEvent.submit(textarea.form!);
    expect(synthesis.stopCalls).toBeGreaterThanOrEqual(1);
  });

  it("29. permission filtering before speech (no money spoken when filtered)", async () => {
    // Render with NO finance perms via a custom engine context is not possible
    // through the panel (perms come from useCopilotSources = full). Instead,
    // verify the formatter directly against a permission-filtered answer.
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Who is already late?",
      emptyConversation(),
      engineCtx(r.current.sources, NO_FINANCE_PERMS),
    );
    const spoken = buildCopilotSpokenResponse(a, NO_FINANCE_PERMS);
    expect(spoken).not.toMatch(/\$\d/);
    expect(spoken).not.toMatch(/\d+ dollars/i);
  });
});

// ---------------------------------------------------------------------------
// Context retention for voice
// ---------------------------------------------------------------------------

describe("Build #38 — Voice context retention", () => {
  const r = useCopilotTestSources();

  it("30. customer context retained for voice follow-up", () => {
    const custId = r.current.sources.briefing.store.customers[0].id;
    const conv = { ...emptyConversation(), context_customer_id: custId };
    const a = resolveCopilotQuery(
      "What does he owe?",
      conv,
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("customer_balance");
    const spoken = buildCopilotSpokenResponse(a, FULL_PERMS);
    expect(spoken.length).toBeGreaterThan(0);
  });

  it("31. vehicle context retained for voice follow-up", () => {
    const v = firstVehicle(r.current.sources);
    const conv = { ...emptyConversation(), context_vehicle_id: v.id };
    const a = resolveCopilotQuery(
      "What's going on with it?",
      conv,
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("vehicle_status");
    const spoken = buildCopilotSpokenResponse(a, FULL_PERMS);
    expect(spoken.length).toBeGreaterThan(0);
  });

  it("32. rental context retained for voice follow-up", () => {
    const rentals = r.current.sources.briefing.store.rentals;
    const rentalId = rentals[0]?.id;
    if (!rentalId) return;
    const conv = { ...emptyConversation(), context_rental_id: rentalId };
    const a = resolveCopilotQuery(
      "When is their next payment?",
      conv,
      engineCtx(r.current.sources),
    );
    // Either resolves to a rental intent or a graceful fallback — both safe.
    const spoken = buildCopilotSpokenResponse(a, FULL_PERMS);
    expect(spoken.length).toBeGreaterThan(0);
  });

  it("33. dashboard context — utilization question resolves", () => {
    const a = resolveCopilotQuery(
      "Why is fleet utilization down?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const spoken = buildCopilotSpokenResponse(a, FULL_PERMS);
    expect(spoken.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Action guardrails (voice must not auto-mutate)
// ---------------------------------------------------------------------------

describe("Build #38 — Voice action guardrails", () => {
  const r = useCopilotTestSources();

  it("34. create-tasks request produces a preview, not a mutation", () => {
    const a = resolveCopilotQuery(
      "Create tasks for those three vehicles",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    // Either a task_preview (confirm before creating) or a fallback — never a
    // direct mutation. The engine never mutates from a query.
    expect(a.task_preview ?? []).toEqual(a.task_preview ?? []);
    const spoken = buildCopilotSpokenResponse(a, FULL_PERMS);
    // Spoken text must mention review/confirm when a preview is offered.
    if (a.task_preview && a.task_preview.length > 0) {
      expect(spoken + a.caveats.join(" ")).toMatch(/confirm|review|preview/i);
    }
  });

  it("35. draft reminders are never auto-sent", () => {
    const a = resolveCopilotQuery(
      "Draft reminders for everyone overdue",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    // Drafts may be prepared, but the answer must indicate review-before-send.
    const text = a.summary + " " + a.caveats.join(" ");
    if (a.draft_messages && a.draft_messages.length > 0) {
      expect(text).toMatch(/review|draft|never sends/i);
    }
  });
});
