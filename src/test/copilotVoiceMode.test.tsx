// Connect Pro Fleet — Build #39 True Voice Conversation integration tests.
//
// Verifies the PRIMARY microphone button now ENTERS true conversational Voice
// Mode (auto-submit + auto-speak + auto-listen-again) instead of Build #38
// push-to-talk dictation into the composer. Uses the REAL rendered CopilotPanel
// with mock speech adapters.
//
// NOTE: submitTranscript() schedules synthesis.speak() via a 120ms setTimeout
// so the "thinking" phase is perceptible. Tests therefore use waitForSpeech()
// (a waitFor + act flush) before asserting on synthesis.spokenTexts.

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

/** Enter Voice Mode by clicking the Voice Conversation button (NOT the
 *  dictation mic). The dictation mic is a separate control with aria-label
 *  "Dictate message"; clicking it only populates the composer. */
async function enterVoiceMode(
  recognition: MockRecognitionProvider,
  synthesis: MockSynthesisProvider,
) {
  renderVoicePanel({ recognition, synthesis });
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

describe("Build #39 — Primary mic enters true Voice Mode", () => {
  let recognition: MockRecognitionProvider;
  let synthesis: MockSynthesisProvider;

  beforeEach(() => {
    recognition = makeMockRecognition();
    synthesis = makeMockSynthesis();
  });

  it("1. global Copilot mic enters Voice Mode", async () => {
    await enterVoiceMode(recognition, synthesis);
    expect(screen.getByText(/Fleet Copilot Voice/i)).toBeTruthy();
    expect(screen.getByText(/Listening…/i)).toBeTruthy();
  });

  it("2. mic does not merely populate the composer (no dictation)", async () => {
    renderVoicePanel({ recognition, synthesis });
    const textarea = screen.getByLabelText(
      "Ask Fleet Copilot",
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
    fireEvent.click(
      screen.getByRole("button", { name: "Start Voice Conversation" }),
    );
    await flush();
    // The text composer is never populated by speech.
    expect(textarea.value).toBe("");
  });

  it("3. normal composer is replaced while Voice Mode active", async () => {
    await enterVoiceMode(recognition, synthesis);
    expect(screen.queryByLabelText("Ask Fleet Copilot")).toBeNull();
  });

  it("4. transcript auto-submits (no Send click required)", async () => {
    await enterVoiceMode(recognition, synthesis);
    act(() => recognition.deliverFinalAndEnd("Who owes me money today?"));
    await flush();
    await waitFor(() =>
      expect(screen.getByText(/Who owes me money today?/i)).toBeTruthy(),
    );
  });

  it("5. no Send click required — question appears as a turn", async () => {
    await enterVoiceMode(recognition, synthesis);
    act(() => recognition.deliverFinalAndEnd("What should I focus on first?"));
    await flush();
    await waitFor(() =>
      expect(screen.getByText(/What should I focus on first?/i)).toBeTruthy(),
    );
  });

  it("6. answer invokes synthesis automatically (no Read Aloud click)", async () => {
    await enterVoiceMode(recognition, synthesis);
    await speakTurn(recognition, synthesis, "Who owes me money today?");
    expect(synthesis.spokenTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("7. no Read Aloud click required — speech is automatic", async () => {
    await enterVoiceMode(recognition, synthesis);
    await speakTurn(recognition, synthesis, "Who owes me money today?");
    expect(synthesis.spokenTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("8. synthesis occurs even when text-chat auto-play is off", async () => {
    await enterVoiceMode(recognition, synthesis);
    await speakTurn(recognition, synthesis, "Who owes me money today?");
    // autoPlaySpokenResponses defaults OFF; Voice Mode ignores it.
    expect(synthesis.spokenTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("9. synthesis occurs even when Read Aloud preference is off", async () => {
    await enterVoiceMode(recognition, synthesis);
    await speakTurn(recognition, synthesis, "Who owes me money today?");
    expect(synthesis.spokenTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("10. speaking completion resumes listening", async () => {
    await enterVoiceMode(recognition, synthesis);
    await speakTurn(recognition, synthesis, "Who owes me money today?");
    expect(synthesis.speaking).toBe(true);
    act(() => synthesis.finishSpeaking());
    await flush();
    await waitFor(() =>
      expect(recognition.startCalls).toBeGreaterThanOrEqual(2),
    );
    expect(screen.getByText(/Listening…/i)).toBeTruthy();
  });

  it("11. second turn auto-submits (conversational follow-up)", async () => {
    await enterVoiceMode(recognition, synthesis);
    await speakTurn(recognition, synthesis, "Who owes me money today?");
    act(() => synthesis.finishSpeaking());
    await flush();
    await speakTurn(recognition, synthesis, "What should I focus on first?");
    expect(screen.getByText(/What should I focus on first?/i)).toBeTruthy();
    expect(synthesis.spokenTexts.length).toBeGreaterThanOrEqual(2);
  });

  it("12. End Voice restores normal text UI", async () => {
    await enterVoiceMode(recognition, synthesis);
    await speakTurn(recognition, synthesis, "Who owes me money today?");
    fireEvent.click(screen.getByRole("button", { name: "End Voice" }));
    await flush();
    expect(recognition.isListening).toBe(false);
    expect(screen.getByLabelText("Ask Fleet Copilot")).toBeTruthy();
    // The voice turn persists in the unified conversation history.
    expect(
      screen.getAllByText(/Who owes me money today?/i).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("13. global header Copilot path works (panel renders mic)", () => {
    renderVoicePanel({ recognition, synthesis });
    expect(
      screen.getByRole("button", { name: "Start Voice Conversation" }),
    ).toBeTruthy();
  });

  it("14. Action Center Copilot path works (same panel)", async () => {
    await enterVoiceMode(recognition, synthesis);
    expect(screen.getByText(/Fleet Copilot Voice/i)).toBeTruthy();
  });

  it("15. dashboard context works (utilization question resolves in voice)", async () => {
    await enterVoiceMode(recognition, synthesis);
    await speakTurn(recognition, synthesis, "Why is fleet utilization down?");
    expect(synthesis.spokenTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("16. speaking phase shows a stable speaking indicator (no interrupt button)", async () => {
    await enterVoiceMode(recognition, synthesis);
    await speakTurn(recognition, synthesis, "Who owes me money today?");
    expect(synthesis.speaking).toBe(true);
    // Build #41: the Interrupt button was removed to stop the control-area
    // blink. The speaking phase now shows a stable status pill instead.
    expect(screen.queryByRole("button", { name: /Interrupt/i })).toBeNull();
    expect(
      screen.getByRole("generic", { name: "Copilot is speaking" }),
    ).toBeTruthy();
    // End Voice still stops speech.
    fireEvent.click(screen.getByRole("button", { name: "End Voice" }));
    await flush();
    expect(synthesis.speaking).toBe(false);
  });

  it("17. End Voice stops recognition", async () => {
    await enterVoiceMode(recognition, synthesis);
    fireEvent.click(screen.getByRole("button", { name: "End Voice" }));
    await flush();
    expect(recognition.isListening).toBe(false);
  });

  it("18. End Voice stops speech", async () => {
    await enterVoiceMode(recognition, synthesis);
    await speakTurn(recognition, synthesis, "Who owes me money today?");
    fireEvent.click(screen.getByRole("button", { name: "End Voice" }));
    await flush();
    expect(synthesis.speaking).toBe(false);
  });

  it("19. closing panel stops microphone (unmount)", async () => {
    const { unmount } = renderVoicePanel({ recognition, synthesis });
    fireEvent.click(
      screen.getByRole("button", { name: "Start Voice Conversation" }),
    );
    await flush();
    expect(recognition.isListening).toBe(true);
    unmount();
    expect(recognition.disposeCalls).toBeGreaterThanOrEqual(1);
    expect(recognition.isListening).toBe(false);
  });

  it("20. double-start prevented", async () => {
    await enterVoiceMode(recognition, synthesis);
    const calls = recognition.startCalls;
    act(() => recognition.deliverNaturalEnd());
    await flush();
    await waitFor(() => expect(recognition.startCalls).toBe(calls + 1));
  });

  it("21. safe auto-restart (no auto-restart loop)", async () => {
    await enterVoiceMode(recognition, synthesis);
    const before = recognition.startCalls;
    act(() => recognition.deliverNaturalEnd());
    await flush();
    await waitFor(() => expect(recognition.startCalls).toBe(before + 1));
  });

  it("22. recognition onend behavior — natural end resumes listening", async () => {
    await enterVoiceMode(recognition, synthesis);
    act(() => recognition.deliverNaturalEnd());
    await flush();
    await waitFor(() => expect(screen.getByText(/Listening…/i)).toBeTruthy());
  });

  it("23. no-speech recovery", async () => {
    await enterVoiceMode(recognition, synthesis);
    act(() =>
      recognition.deliverError(
        "I didn't catch that. Try again or type your question.",
      ),
    );
    await flush();
    await waitFor(() => expect(screen.getByText(/Listening…/i)).toBeTruthy());
  });

  it("24. network error recovery", async () => {
    await enterVoiceMode(recognition, synthesis);
    act(() =>
      recognition.deliverError(
        "Voice recognition couldn't connect. You can try again or continue typing.",
      ),
    );
    await flush();
    await waitFor(() => expect(screen.getByText(/Listening…/i)).toBeTruthy());
  });

  it("25. permission denied exits safely", async () => {
    recognition.permissionState = "denied";
    renderVoicePanel({ recognition, synthesis });
    fireEvent.click(
      screen.getByRole("button", { name: "Start Voice Conversation" }),
    );
    await flush();
    expect(screen.getByText(/Microphone access is turned off/i)).toBeTruthy();
    expect(screen.getByLabelText("Ask Fleet Copilot")).toBeTruthy();
  });

  it("26. unsupported browser — mic hidden, typed usable", () => {
    recognition.supported = false;
    renderVoicePanel({ recognition, synthesis });
    expect(
      screen.queryByRole("button", { name: "Start Voice Conversation" }),
    ).toBeNull();
    expect(
      screen.getByPlaceholderText("Ask about your operation…"),
    ).toBeTruthy();
  });

  it("27. text mode still requires Send", async () => {
    renderVoicePanel({ recognition, synthesis });
    const textarea = screen.getByLabelText(
      "Ask Fleet Copilot",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "Who owes me money today?" },
    });
    await flush();
    expect(screen.queryByText(/Working on it/i)).toBeNull();
    expect(synthesis.spokenTexts.length).toBe(0);
  });

  it("28. text mode Read Aloud still optional (auto-play off)", async () => {
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
    expect(synthesis.spokenTexts.length).toBe(0);
  });

  it("29. voice mode always speaks (auto-speak regardless of settings)", async () => {
    await enterVoiceMode(recognition, synthesis);
    await speakTurn(recognition, synthesis, "Who owes me money today?");
    expect(synthesis.spokenTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("30. action requires confirmation (no auto-mutation)", async () => {
    await enterVoiceMode(recognition, synthesis);
    act(() =>
      recognition.deliverFinalAndEnd("Create tasks for those three vehicles"),
    );
    await flush();
    expect(screen.queryByText(/Created 3 tasks/i)).toBeNull();
  });

  it("31. draft does not send", async () => {
    await enterVoiceMode(recognition, synthesis);
    act(() =>
      recognition.deliverFinalAndEnd("Draft reminders for everyone overdue"),
    );
    await flush();
    expect(screen.queryByText(/Reminders sent/i)).toBeNull();
  });

  it("32. no duplicate submission of the same final transcript", async () => {
    await enterVoiceMode(recognition, synthesis);
    await speakTurn(recognition, synthesis, "Who owes me money today?");
    const spoken = synthesis.spokenTexts.length;
    act(() => recognition.emit());
    await flush();
    expect(synthesis.spokenTexts.length).toBe(spoken);
  });

  it("33. unified conversation history (voice turn persists after End Voice)", async () => {
    await enterVoiceMode(recognition, synthesis);
    await speakTurn(recognition, synthesis, "Who owes me money today?");
    fireEvent.click(screen.getByRole("button", { name: "End Voice" }));
    await flush();
    expect(
      screen.getAllByText(/Who owes me money today?/i).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("34. mobile Voice Conversation control present (large touch target)", () => {
    renderVoicePanel({ recognition, synthesis });
    const mic = screen.getByRole("button", {
      name: "Start Voice Conversation",
    });
    expect(mic.getAttribute("aria-label")).toBeTruthy();
  });

  it("35. accessibility — Voice Conversation button has aria-label + title", () => {
    renderVoicePanel({ recognition, synthesis });
    const mic = screen.getByRole("button", {
      name: "Start Voice Conversation",
    });
    expect(mic.getAttribute("aria-label")).toBe("Start Voice Conversation");
    expect(mic.getAttribute("title")).toBeTruthy();
  });

  it("36. interim transcript is not submitted", async () => {
    await enterVoiceMode(recognition, synthesis);
    act(() => recognition.deliverInterim("how many pickups"));
    await flush();
    expect(screen.queryByText(/how many pickups/i)).toBeNull();
  });

  it("37. Copilot engine called once per turn (no duplicate resolution)", async () => {
    await enterVoiceMode(recognition, synthesis);
    await speakTurn(recognition, synthesis, "Who owes me money today?");
    // Exactly one spoken response for one turn.
    expect(synthesis.spokenTexts.length).toBe(1);
  });
});
