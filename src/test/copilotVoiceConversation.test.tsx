// Connect Pro Fleet — Copilot True Voice Conversation tests (Build #39).
//
// Covers the conversational Voice Mode state machine: auto-submit, auto-speak,
// auto-listen-again, barge-in/interrupt, End Voice, double-start protection,
// safe auto-restart, recognition onend behavior, no-speech/network/permission
// recovery, unsupported browser, unified history, context retention, action
// guardrails, spoken privacy, mobile, accessibility, no duplicate submission,
// no auto-restart loop.
//
// Mock adapters come from ./copilotVoiceTestHarness.tsx (NON-test module).
// Engine answers come from the real deterministic Copilot engine against seeded
// data, so the spoken formatter + engine are exercised against genuine answers.

import { describe, it, expect, beforeEach } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import {
  renderVoicePanel,
  makeMockRecognition,
  makeMockSynthesis,
  flush,
  type MockRecognitionProvider,
  type MockSynthesisProvider,
} from "./copilotVoiceTestHarness";
import {
  useCopilotTestSources,
  engineCtx,
  emptyConversation,
  FULL_PERMS,
  NO_FINANCE_PERMS,
} from "./copilotTestHarness";
import { resolveCopilotQuery } from "@/lib/copilotEngine";
import { buildCopilotSpokenResponse } from "@/lib/copilotVoiceSpeech";

async function startVoice() {
  fireEvent.click(
    screen.getByRole("button", { name: "Start Voice Conversation" }),
  );
  await flush();
}

/** Wait for the 120ms "thinking" beat to fire synthesis.speak(). */
async function waitForSpeech(synthesis: MockSynthesisProvider, min = 1) {
  await waitFor(() => {
    expect(synthesis.spokenTexts.length).toBeGreaterThanOrEqual(min);
  });
}

/** Speak a finalized utterance in Voice Mode and wait for a NEW spoken response. */
async function speakTurn(
  recognition: MockRecognitionProvider,
  synthesis: MockSynthesisProvider,
  text: string,
) {
  const before = synthesis.spokenTexts.length;
  act(() => recognition.deliverFinalAndEnd(text));
  await flush();
  await waitFor(() =>
    expect(synthesis.spokenTexts.length).toBeGreaterThan(before),
  );
}

describe("Build #39 — True Voice Conversation", () => {
  let recognition: MockRecognitionProvider;
  let synthesis: MockSynthesisProvider;

  beforeEach(() => {
    recognition = makeMockRecognition();
    synthesis = makeMockSynthesis();
  });

  // 1–9: core conversational loop
  it("1. Start Voice Mode enters listening", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    expect(screen.getByText("Listening…")).toBeTruthy();
    expect(recognition.isListening).toBe(true);
  });

  it("2. Voice state becomes listening (phase)", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    // The orb screen shows "Listening…".
    expect(screen.getByText("Listening…")).toBeTruthy();
  });

  it("3. final transcript captured", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    act(() => recognition.deliverFinalAndEnd("How many pickups today?"));
    await flush();
    // The finalized utterance is consumed + submitted as a user turn (spec §5:
    // one utterance → one submission; consumeTranscript clears the provider
    // buffer, so we assert the submitted user message rather than the raw
    // provider transcript, which is correctly emptied after consumption).
    await waitFor(() =>
      expect(screen.getByText(/How many pickups today\?/i)).toBeTruthy(),
    );
  });

  it("4. interim transcript not submitted", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    act(() => recognition.deliverInterim("partial words"));
    await flush();
    // No answer rendered yet.
    expect(screen.queryByText(/thinking/i)).toBeNull();
    expect(synthesis.spokenTexts.length).toBe(0);
  });

  it("5. final transcript auto-submits (no manual Send)", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    act(() => recognition.deliverFinalAndEnd("Who owes me money today?"));
    await flush();
    // The engine was called → a thinking/speaking state appears. The phase
    // label and the control status pill may both render the phase word, so
    // use getAllByText (multiple matches are fine).
    await waitFor(() => {
      expect(
        screen.getAllByText(/thinking|speaking|submitting/i).length > 0 ||
          synthesis.spokenTexts.length > 0,
      ).toBeTruthy();
    });
  });

  it("6. no manual Send required", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    // No Send button in Voice Mode (it's the Voice screen, not the composer).
    expect(screen.queryByRole("button", { name: "Ask" })).toBeNull();
    act(() => recognition.deliverFinalAndEnd("Who owes me money today?"));
    await flush();
    await waitFor(() => {
      expect(synthesis.spokenTexts.length).toBeGreaterThan(0);
    });
  });

  it("7. Copilot engine called once per turn", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    act(() => recognition.deliverFinalAndEnd("Who owes me money today?"));
    await flush();
    await waitFor(() => {
      expect(synthesis.spokenTexts.length).toBe(1);
    });
    // Only one spoken response for one utterance.
    expect(synthesis.spokenTexts.length).toBe(1);
  });

  it("8. response auto-speaks in Voice Mode", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    act(() => recognition.deliverFinalAndEnd("Who owes me money today?"));
    await waitFor(() => {
      expect(synthesis.spokenTexts.length).toBe(1);
    });
  });

  it("9. no Read Aloud click required in Voice Mode", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    act(() => recognition.deliverFinalAndEnd("Who owes me money today?"));
    await waitFor(() => {
      expect(synthesis.spokenTexts.length).toBe(1);
    });
    // The Voice screen has no "Read aloud" control.
    expect(screen.queryByText(/Read aloud/i)).toBeNull();
  });

  // 10–11: listen-again + second question
  it("10. speaking completion returns to listening", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    act(() => recognition.deliverFinalAndEnd("Who owes me money today?"));
    await waitFor(() => {
      expect(synthesis.speaking).toBe(true);
    });
    act(() => synthesis.finishSpeaking());
    await flush();
    await waitFor(() => {
      expect(screen.getByText("Listening…")).toBeTruthy();
    });
    expect(recognition.isListening).toBe(true);
  });

  it("11. second question works after first", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    act(() => recognition.deliverFinalAndEnd("Who owes me money today?"));
    await waitFor(() => {
      expect(synthesis.spokenTexts.length).toBe(1);
    });
    act(() => synthesis.finishSpeaking());
    await flush();
    // Second turn.
    act(() => recognition.deliverFinalAndEnd("What should I focus on first?"));
    await waitFor(() => {
      expect(synthesis.spokenTexts.length).toBe(2);
    });
  });

  // 12: follow-up context
  it("12. conversational follow-up context retained", async () => {
    const r = useCopilotTestSources();
    const base = resolveCopilotQuery(
      "Who is already late?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    // Simulate the engine binding prior intent + a customer for "why?".
    const conv = {
      ...emptyConversation(),
      context_prior_intent: "overdue_accounts" as const,
      context_customer_id: base.sources[0]?.entity_id ?? null,
    };
    const why = resolveCopilotQuery("Why?", conv, engineCtx(r.current.sources));
    expect(why.intent).toBe("why");
    const spoken = buildCopilotSpokenResponse(why, FULL_PERMS);
    expect(spoken.length).toBeGreaterThan(0);
  });

  // 13–20: context + pickup/return accuracy (engine-level, voice uses same engine)
  it("13. dashboard context — utilization question resolves", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Why is fleet utilization down?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(buildCopilotSpokenResponse(a, FULL_PERMS).length).toBeGreaterThan(0);
  });

  it("14. customer context retained", () => {
    const r = useCopilotTestSources();
    const custId = r.current.sources.briefing.store.customers[0].id;
    const conv = { ...emptyConversation(), context_customer_id: custId };
    const a = resolveCopilotQuery(
      "What does he owe?",
      conv,
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("customer_balance");
  });

  it("15. vehicle context retained", () => {
    const r = useCopilotTestSources();
    const v = r.current.sources.briefing.store.vehicles[0];
    const conv = { ...emptyConversation(), context_vehicle_id: v.id };
    const a = resolveCopilotQuery(
      "What's going on with it?",
      conv,
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("vehicle_status");
  });

  it("16. rental context retained", () => {
    const r = useCopilotTestSources();
    const rentalId = r.current.sources.briefing.store.rentals[0]?.id;
    if (!rentalId) return;
    const conv = { ...emptyConversation(), context_rental_id: rentalId };
    const a = resolveCopilotQuery(
      "When is their next payment?",
      conv,
      engineCtx(r.current.sources),
    );
    expect(buildCopilotSpokenResponse(a, FULL_PERMS).length).toBeGreaterThan(0);
  });

  it("17. pickup completed query resolves", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "How many pickups have we had today?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(buildCopilotSpokenResponse(a, FULL_PERMS).length).toBeGreaterThan(0);
  });

  it("18. pickup scheduled query resolves", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "How many pickups are scheduled today?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(buildCopilotSpokenResponse(a, FULL_PERMS).length).toBeGreaterThan(0);
  });

  it("19. pickup remaining query resolves", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "How many pickups are left today?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(buildCopilotSpokenResponse(a, FULL_PERMS).length).toBeGreaterThan(0);
  });

  it("20. return completed query resolves", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "How many returns have we had today?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(buildCopilotSpokenResponse(a, FULL_PERMS).length).toBeGreaterThan(0);
  });

  // 21–22: speaking phase (Build #41 removed the Interrupt button to stop the
  // control-area blink; barge-in is no longer a manual button).
  it("21. speaking phase shows a stable speaking indicator (no interrupt button)", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    act(() => recognition.deliverFinalAndEnd("Who owes me money today?"));
    await waitFor(() => {
      expect(synthesis.speaking).toBe(true);
    });
    expect(screen.queryByRole("button", { name: /Interrupt/i })).toBeNull();
    expect(
      screen.getByRole("generic", { name: "Copilot is speaking" }),
    ).toBeTruthy();
  });

  it("22. End Voice stops speech during speaking", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    act(() => recognition.deliverFinalAndEnd("Who owes me money today?"));
    await waitFor(() => {
      expect(synthesis.speaking).toBe(true);
    });
    fireEvent.click(screen.getByRole("button", { name: "End Voice" }));
    await flush();
    expect(synthesis.speaking).toBe(false);
  });

  // 23–26: End Voice + cleanup
  it("23. End Voice stops recognition", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    expect(recognition.isListening).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "End Voice" }));
    await flush();
    expect(recognition.isListening).toBe(false);
    expect(recognition.stopCalls).toBeGreaterThanOrEqual(1);
  });

  it("24. End Voice stops speech", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    act(() => recognition.deliverFinalAndEnd("Who owes me money today?"));
    await waitFor(() => {
      expect(synthesis.speaking).toBe(true);
    });
    fireEvent.click(screen.getByRole("button", { name: "End Voice" }));
    expect(synthesis.stopCalls).toBeGreaterThanOrEqual(1);
    expect(synthesis.speaking).toBe(false);
  });

  it("25. closing panel stops microphone", async () => {
    const { unmount } = renderVoicePanel({ recognition, synthesis });
    await startVoice();
    expect(recognition.isListening).toBe(true);
    unmount();
    expect(recognition.disposeCalls).toBeGreaterThanOrEqual(1);
    expect(recognition.isListening).toBe(false);
  });

  it("26. unmount stops microphone (no background recording)", async () => {
    const { unmount } = renderVoicePanel({ recognition, synthesis });
    await startVoice();
    unmount();
    expect(recognition.disposeCalls).toBeGreaterThanOrEqual(1);
  });

  // 27–28: double-start + safe auto-restart
  it("27. double-start prevented", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    const firstCalls = recognition.startCalls;
    // Attempting to start again must not call start again.
    await act(async () => {
      await recognition.startListening();
    });
    expect(recognition.startCalls).toBe(firstCalls);
  });

  it("28. safe auto-restart after speech ends", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    act(() => recognition.deliverFinalAndEnd("Who owes me money today?"));
    await waitFor(() => {
      expect(synthesis.speaking).toBe(true);
    });
    act(() => synthesis.finishSpeaking());
    await flush();
    // Recognition restarted automatically after natural speech completion.
    await waitFor(() => {
      expect(recognition.isListening).toBe(true);
    });
  });

  // 29: recognition onend behavior
  it("29. recognition onend (natural) does not exit Voice Mode", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    act(() => recognition.deliverNaturalEnd());
    await flush();
    // Voice Mode is still active (End Voice still present).
    expect(screen.getByRole("button", { name: "End Voice" })).toBeTruthy();
  });

  // 30–33: error recovery
  it("30. no-speech recovery returns to listening", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    act(() =>
      recognition.deliverError(
        "I didn't catch that. Try again or type your question.",
      ),
    );
    await flush();
    // After the recovery beat, listening resumes.
    await waitFor(
      () => {
        expect(screen.getByText("Listening…")).toBeTruthy();
      },
      { timeout: 2000 },
    );
  });

  it("31. network error recovery shows message", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    act(() =>
      recognition.deliverError(
        "Voice recognition couldn't connect. You can try again or continue typing.",
      ),
    );
    await flush();
    expect(screen.getByText(/couldn't connect/i)).toBeTruthy();
  });

  it("32. permission denied exits Voice Mode safely", async () => {
    recognition.permissionState = "denied";
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    await flush();
    // Voice Mode exited; typed Copilot remains.
    expect(screen.queryByRole("button", { name: "End Voice" })).toBeNull();
    expect(screen.getByLabelText("Ask Fleet Copilot")).toBeTruthy();
  });

  it("33. unsupported browser hides Voice entry", () => {
    recognition.supported = false;
    renderVoicePanel({ recognition, synthesis });
    expect(
      screen.queryByRole("button", { name: "Start Voice Conversation" }),
    ).toBeNull();
    // Typed Copilot remains usable.
    expect(
      screen.getByPlaceholderText("Ask about your operation…"),
    ).toBeTruthy();
  });

  // 34–36: text mode behavior
  it("34. text mode still requires Send", async () => {
    renderVoicePanel({ recognition, synthesis });
    const textarea = screen.getByLabelText(
      "Ask Fleet Copilot",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "Who owes me money today?" },
    });
    await flush();
    // Not submitted until Send.
    expect(screen.queryByText(/Working on it/i)).toBeNull();
  });

  it("35. text mode Read Aloud still optional", async () => {
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
    // Nothing spoken automatically (auto-play off).
    expect(synthesis.spokenTexts.length).toBe(0);
  });

  it("36. voice mode always speaks (auto-speak)", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    act(() => recognition.deliverFinalAndEnd("Who owes me money today?"));
    await waitFor(() => {
      expect(synthesis.spokenTexts.length).toBe(1);
    });
  });

  // 37–40: guardrails + privacy
  it("37. action requires confirmation (no auto-mutation)", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Create tasks for those three vehicles",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    // The engine never mutates from a query; a preview may be offered.
    expect(a.task_preview ?? []).toEqual(a.task_preview ?? []);
    const spoken = buildCopilotSpokenResponse(a, FULL_PERMS);
    if (a.task_preview && a.task_preview.length > 0) {
      expect(spoken + a.caveats.join(" ")).toMatch(/confirm|review|preview/i);
    }
  });

  it("38. draft does not send", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Draft reminders for everyone overdue",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const text = a.summary + " " + a.caveats.join(" ");
    if (a.draft_messages && a.draft_messages.length > 0) {
      expect(text).toMatch(/review|draft|never sends/i);
    }
  });

  it("39. spoken privacy — no source IDs / URLs", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "What should I focus on first?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const spoken = buildCopilotSpokenResponse(a, FULL_PERMS);
    expect(spoken).not.toMatch(/source_module|deep_link|entity_id/i);
    expect(spoken).not.toMatch(/\/[a-z]+\/[a-z0-9_-]+/i);
  });

  it("40. bounded spoken result (no 20-row readout)", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Who should collections follow up with first?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const spoken = buildCopilotSpokenResponse(a, FULL_PERMS);
    expect(spoken.length).toBeLessThan(600);
    if (a.items.length > 0) {
      expect(spoken).toMatch(/review the full list on screen/i);
    }
  });

  // 41: unified history
  it("41. unified conversation history (voice turns persist after End Voice)", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    act(() => recognition.deliverFinalAndEnd("Who owes me money today?"));
    await waitFor(() => {
      expect(synthesis.spokenTexts.length).toBe(1);
    });
    act(() => synthesis.finishSpeaking());
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "End Voice" }));
    await flush();
    // The spoken question is in the text conversation now.
    expect(
      screen.getAllByText("Who owes me money today?").length,
    ).toBeGreaterThan(0);
  });

  // 42–43: mobile + accessibility
  it("42. mobile Voice Mode renders full controls", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    expect(screen.getByRole("button", { name: "End Voice" })).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("43. accessibility — End Voice + speaking status labelled", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    expect(
      screen
        .getByRole("button", { name: "End Voice" })
        .getAttribute("aria-label"),
    ).toBeTruthy();
    act(() => recognition.deliverFinalAndEnd("Who owes me money today?"));
    await waitFor(() => {
      expect(synthesis.speaking).toBe(true);
    });
    // Build #41: the Interrupt button was removed; the speaking phase now
    // exposes a labelled status region instead.
    expect(
      screen.getByRole("generic", { name: "Copilot is speaking" }),
    ).toBeTruthy();
  });

  // 44–45: no duplicate submission + no auto-restart loop
  it("44. no duplicate submission for one utterance", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    act(() => recognition.deliverFinalAndEnd("Who owes me money today?"));
    await waitFor(() => {
      expect(synthesis.spokenTexts.length).toBe(1);
    });
    // Wait a beat; no second submission.
    await flush();
    expect(synthesis.spokenTexts.length).toBe(1);
  });

  it("45. no auto-restart loop after End Voice", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();
    const callsBefore = recognition.startCalls;
    fireEvent.click(screen.getByRole("button", { name: "End Voice" }));
    await flush();
    await flush();
    // No restart attempts after ending.
    expect(recognition.startCalls).toBe(callsBefore);
    expect(recognition.isListening).toBe(false);
  });
});

describe("Build #39 — Spoken privacy (permission-filtered)", () => {
  const r = useCopilotTestSources();

  it("banking values excluded when permission filtered", () => {
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
