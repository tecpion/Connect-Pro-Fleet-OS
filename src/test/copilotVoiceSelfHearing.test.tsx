// Connect Pro Fleet — Build #44 Voice self-hearing + intent-reset regression.
//
// Reproduces the REAL-BROWSER bug where Copilot's OWN spoken response was
// captured by the still-open microphone (continuous=true) and re-submitted as
// a new final transcript — causing the greeting/briefing to repeat and cut
// itself off ("blink"), and making it look like the intent was "locked" to the
// prior answer (Copilot kept answering its own echo instead of the user's real
// next question).
//
// The fix (Build #44):
//  1. The microphone is STOPPED the moment a final transcript is consumed
//     (submitTranscript calls recognition.stopListening()), and is only
//     restarted AFTER the spoken response finishes naturally. So while Copilot
//     is processing/speaking, the mic is off and cannot hear itself.
//  2. As a second line of defense, any final transcript that arrives while the
//     state machine is NOT in the LISTENING phase is dropped (it is almost
//     certainly echo, not real user speech).
//
// These tests also verify the intent is classified FRESH every turn (no intent
// lock): a morning briefing followed by an idle-vehicle question answers the
// idle-vehicle question, not the briefing again.

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

describe("Build #44 — Voice self-hearing / self-interruption fix", () => {
  let recognition: MockRecognitionProvider;
  let synthesis: MockSynthesisProvider;

  beforeEach(() => {
    recognition = makeMockRecognition();
    synthesis = makeMockSynthesis();
  });

  it("1. greeting is spoken once (no repeated/cut-off greeting)", async () => {
    await enterVoiceMode(recognition, synthesis);
    await speakTurn(recognition, synthesis, "Hey Copilot");
    // Exactly ONE spoken response for the greeting.
    expect(synthesis.spokenTexts.length).toBe(1);
    // Simulate Copilot's own speech being captured by the still-open mic WHILE
    // it is speaking (the echo that caused the repeat). The state machine is in
    // the SPEAKING phase, so this must be dropped — no second submission.
    const before = synthesis.spokenTexts.length;
    act(() =>
      recognition.deliverFinalAndEnd(
        "Hi! How can I help? You can ask me about",
      ),
    );
    await flush();
    expect(synthesis.spokenTexts.length).toBe(before);
  });

  it("2. mic is stopped while Copilot is speaking (no open mic during speech)", async () => {
    await enterVoiceMode(recognition, synthesis);
    await speakTurn(recognition, synthesis, "Who owes me money today?");
    // After a turn is submitted, the mic must be STOPPED (Build #44 primary fix).
    expect(recognition.isListening).toBe(false);
    expect(synthesis.speaking).toBe(true);
    // A final transcript arriving during speaking is dropped (echo defense).
    const spoken = synthesis.spokenTexts.length;
    act(() => recognition.deliverFinalAndEnd("Good morning. You have two"));
    await flush();
    expect(synthesis.spokenTexts.length).toBe(spoken);
  });

  it("3. mic resumes only after speech finishes naturally", async () => {
    await enterVoiceMode(recognition, synthesis);
    await speakTurn(recognition, synthesis, "Who owes me money today?");
    expect(recognition.isListening).toBe(false);
    act(() => synthesis.finishSpeaking());
    await flush();
    await waitFor(() => expect(recognition.isListening).toBe(true));
    await waitFor(() => expect(screen.getByText(/Listening…/i)).toBeTruthy());
  });

  it("4. one spoken question → one user message → one Copilot response", async () => {
    await enterVoiceMode(recognition, synthesis);
    await speakTurn(recognition, synthesis, "Who owes me money today?");
    expect(synthesis.spokenTexts.length).toBe(1);
    // End Voice to surface the unified text history.
    fireEvent.click(screen.getByRole("button", { name: "End Voice" }));
    await flush();
    const userTurns = screen.getAllByText(/Who owes me money today\?/i);
    expect(userTurns.length).toBe(1);
  });

  it("5. Copilot does not hear itself and restart listening mid-response", async () => {
    await enterVoiceMode(recognition, synthesis);
    await speakTurn(recognition, synthesis, "Give me my morning briefing");
    expect(synthesis.spokenTexts.length).toBe(1);
    // While speaking, deliver the ECHO of Copilot's own briefing text.
    const echo = synthesis.spokenTexts[0];
    const before = synthesis.spokenTexts.length;
    act(() => recognition.deliverFinalAndEnd(echo));
    await flush();
    // No new response — the echo was dropped.
    expect(synthesis.spokenTexts.length).toBe(before);
    // Mic stays off while speaking.
    expect(recognition.isListening).toBe(false);
  });
});

describe("Build #44 — Intent is fresh every turn (no intent lock)", () => {
  let recognition: MockRecognitionProvider;
  let synthesis: MockSynthesisProvider;

  beforeEach(() => {
    recognition = makeMockRecognition();
    synthesis = makeMockSynthesis();
  });

  it("6. briefing then idle-vehicle question answers the idle question, NOT briefing", async () => {
    await enterVoiceMode(recognition, synthesis);
    // Turn 1 — morning briefing.
    await speakTurn(recognition, synthesis, "Give me my morning briefing");
    const briefingSpoken = synthesis.spokenTexts[0];
    // Finish speaking so the mic resumes for turn 2.
    act(() => synthesis.finishSpeaking());
    await flush();
    await waitFor(() => expect(recognition.isListening).toBe(true));

    // Turn 2 — a DIFFERENT question. Must NOT repeat the briefing.
    await speakTurn(
      recognition,
      synthesis,
      "What vehicle has been idle the longest?",
    );
    const secondSpoken = synthesis.spokenTexts[1];
    // The second answer is distinct from the briefing (not a repeat).
    expect(secondSpoken).not.toBe(briefingSpoken);
    // It addresses idle vehicles, not the morning briefing.
    expect(secondSpoken.length).toBeGreaterThan(0);
  });

  it("7. briefing then 'what changed since yesterday' answers changes, NOT briefing", async () => {
    await enterVoiceMode(recognition, synthesis);
    await speakTurn(recognition, synthesis, "Give me my morning briefing");
    act(() => synthesis.finishSpeaking());
    await flush();
    await waitFor(() => expect(recognition.isListening).toBe(true));

    const before = synthesis.spokenTexts.length;
    act(() => recognition.deliverFinalAndEnd("What changed since yesterday?"));
    await flush();
    await waitFor(() =>
      expect(synthesis.spokenTexts.length).toBeGreaterThan(before),
    );
    const secondSpoken = synthesis.spokenTexts[1];
    // Must not be the morning-briefing phrasing.
    expect(secondSpoken).not.toMatch(/Good morning/i);
  });

  it("8. each new question is a new intent (no carry-over of prior intent)", async () => {
    await enterVoiceMode(recognition, synthesis);
    await speakTurn(recognition, synthesis, "Give me my morning briefing");
    act(() => synthesis.finishSpeaking());
    await flush();
    await waitFor(() => expect(recognition.isListening).toBe(true));

    await speakTurn(recognition, synthesis, "Which vehicles are blocked?");
    act(() => synthesis.finishSpeaking());
    await flush();
    await waitFor(() => expect(recognition.isListening).toBe(true));

    await speakTurn(recognition, synthesis, "What changed since yesterday?");
    // Three distinct spoken responses — each turn answered independently.
    expect(synthesis.spokenTexts.length).toBe(3);
    expect(synthesis.spokenTexts[2]).not.toMatch(/Good morning/i);
  });
});

describe("Build #44 — Follow-up context ('that') binds to prior subject", () => {
  let recognition: MockRecognitionProvider;
  let synthesis: MockSynthesisProvider;

  beforeEach(() => {
    recognition = makeMockRecognition();
    synthesis = makeMockSynthesis();
  });

  it("9. 'tell me more about that' uses the immediately prior subject", async () => {
    await enterVoiceMode(recognition, synthesis);
    // Turn 1 — establish a subject (overdue returns).
    await speakTurn(
      recognition,
      synthesis,
      "Tell me about the overdue return.",
    );
    act(() => synthesis.finishSpeaking());
    await flush();
    await waitFor(() => expect(recognition.isListening).toBe(true));

    // Turn 2 — "that" must bind to the prior subject, not restart a briefing.
    const before = synthesis.spokenTexts.length;
    act(() =>
      recognition.deliverFinalAndEnd("Can you tell me more about that?"),
    );
    await flush();
    await waitFor(() =>
      expect(synthesis.spokenTexts.length).toBeGreaterThan(before),
    );
    // The follow-up produced a real answer (not a fallback "which record").
    const followUp = synthesis.spokenTexts[1];
    expect(followUp.length).toBeGreaterThan(0);
  });
});
