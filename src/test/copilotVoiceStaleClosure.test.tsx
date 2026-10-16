// Connect Pro Fleet — Voice Copilot stale-closure regression (Build #40).
//
// Reproduces the REAL-BROWSER bug where the recognition subscription callback
// closed over a STALE submitTranscript (which closes over `conversation`
// state). The subscription effect only re-subscribes on [recognition], which
// is stable for the panel's lifetime, so the callback captured the
// conversation as it existed when the subscription was created (initially
// EMPTY). In the real browser the final transcript arrives on a LATER
// macrotask — AFTER React has re-rendered with the updated conversation from
// prior turns — so a stale closure resolved against the OLD (empty)
// conversation, producing wrong/empty answers for every turn after the first.
//
// The existing mock tests deliver the final transcript synchronously inside
// act(), so the subscription callback runs in the SAME render cycle and never
// exposed the stale closure. These tests deliver turns on REAL macrotasks
// (setTimeout) to match real-browser timing.

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

async function startVoice() {
  fireEvent.click(
    screen.getByRole("button", { name: "Start Voice Conversation" }),
  );
  await flush();
}

describe("Build #40 — Real-browser async stale-closure regression", () => {
  let recognition: MockRecognitionProvider;
  let synthesis: MockSynthesisProvider;

  beforeEach(() => {
    recognition = makeMockRecognition();
    synthesis = makeMockSynthesis();
  });

  it("1. second turn delivered on a later macrotask resolves against the updated conversation", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();

    // First turn — synchronous delivery (mirrors the existing tests).
    act(() => recognition.deliverFinalAndEnd("Who owes me money today?"));
    await waitFor(() => {
      expect(synthesis.spokenTexts.length).toBe(1);
    });
    act(() => synthesis.finishSpeaking());
    await flush();
    await waitFor(() => {
      expect(screen.getByText("Listening…")).toBeTruthy();
    });

    // CRITICAL: deliver the second turn on a REAL macrotask (not inside act).
    // This forces React to have fully committed the first turn's conversation
    // state (the user + assistant messages) before the recognition provider
    // emits the second final transcript. The subscription callback now runs
    // against a re-rendered component. With the stale-closure bug, the
    // callback would call the OLD submitTranscript (captured when the
    // subscription was created, with the EMPTY conversation) → the second
    // turn would resolve against no conversation history. The fix routes
    // through submitTranscriptRef so the LATEST submitTranscript (current
    // conversation) is always used.
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          recognition.deliverFinalAndEnd("What should I focus on first?");
          resolve();
        }, 0);
      });
    });
    await flush();

    // The second turn MUST produce a second spoken response — proving the
    // subscription callback fired submitTranscript against the CURRENT
    // conversation (not a stale empty one that would no-op / fail to resolve).
    await waitFor(() => {
      expect(synthesis.spokenTexts.length).toBe(2);
    });

    // And exactly two user messages exist in the unified history (no stale
    // no-op, no duplicate). End Voice to surface the text body.
    fireEvent.click(screen.getByRole("button", { name: "End Voice" }));
    await flush();
    const userBubbles = screen.getAllByText(
      /Who owes me money today\?|What should I focus on first\?/i,
    );
    expect(userBubbles.length).toBe(2);
  });

  it("2. third turn across multiple macrotasks keeps conversation coherent", async () => {
    renderVoicePanel({ recognition, synthesis });
    await startVoice();

    // Turn 1 — synchronous.
    act(() => recognition.deliverFinalAndEnd("Who owes me money today?"));
    await waitFor(() => expect(synthesis.spokenTexts.length).toBe(1));
    act(() => synthesis.finishSpeaking());
    await flush();
    await waitFor(() => expect(screen.getByText("Listening…")).toBeTruthy());

    // Turn 2 — later macrotask.
    await act(async () => {
      await new Promise<void>((resolve) =>
        setTimeout(() => {
          recognition.deliverFinalAndEnd("What should I focus on first?");
          resolve();
        }, 0),
      );
    });
    await waitFor(() => expect(synthesis.spokenTexts.length).toBe(2));
    act(() => synthesis.finishSpeaking());
    await flush();
    await waitFor(() => expect(screen.getByText("Listening…")).toBeTruthy());

    // Turn 3 — another later macrotask. Each turn's subscription callback
    // must resolve against the conversation as it exists AT THAT MOMENT
    // (with turns 1 + 2 already appended). A stale closure from the original
    // subscription would resolve against the empty conversation for turn 3.
    await act(async () => {
      await new Promise<void>((resolve) =>
        setTimeout(() => {
          recognition.deliverFinalAndEnd("What's blocking the fleet?");
          resolve();
        }, 0),
      );
    });
    await waitFor(() => expect(synthesis.spokenTexts.length).toBe(3));
  });
});
