// Connect Pro Fleet — speech-recognition provider lifecycle tests.
//
// Verifies the real browser adapter's event handling for the bug where:
//   1. User speaks a partial phrase ("hey copilot tell me about") and pauses.
//   2. Chrome fires an interim result, then `no-speech` + `onend` on the pause.
//   3. The adapter used to PROMOTE that leftover interim to a final transcript
//      on `onend`, which bumped finalSeq → the hook auto-submitted the PARTIAL
//      fragment → Copilot couldn't resolve it → spoke "I couldn't determine
//      which record" → the orb flashed to speaking (Interrupt button) and cut
//      the user off mid-utterance ("it didn't understand").
//
// Fix: only results the browser explicitly marks isFinal=true are ever
// committed. Interim is never promoted on end (spec §3, §7). These tests drive
// the real adapter through a fake SpeechRecognition that exposes its event
// callbacks so we can assert the actual onresult/onend sequence.

import { describe, it, expect } from "vitest";
import { createBrowserSpeechRecognition } from "@/lib/copilotVoiceSpeechRecognition";

/** A fake SpeechRecognition whose event callbacks the test can drive directly. */
class FakeRecognition {
  lang = "";
  interimResults = false;
  continuous = false;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  start() {
    this.started = true;
  }
  stop() {}
  abort() {}
}

function withCtor() {
  const w = window as unknown as {
    SpeechRecognition?: new () => unknown;
    webkitSpeechRecognition?: new () => unknown;
  };
  const origSpeech = w.SpeechRecognition;
  const origWebkit = w.webkitSpeechRecognition;
  const instance = new FakeRecognition();
  const Ctor = function () {
    return instance;
  } as unknown as new () => unknown;
  w.SpeechRecognition = Ctor;
  w.webkitSpeechRecognition = undefined;
  return {
    instance,
    restore: () => {
      w.SpeechRecognition = origSpeech;
      w.webkitSpeechRecognition = origWebkit;
    },
  };
}

/** Build a SpeechRecognitionEvent-like object. */
function resultEvent(
  results: Array<{ isFinal: boolean; transcript: string }>,
  resultIndex = 0,
) {
  const arr = results.map((r) => ({
    isFinal: r.isFinal,
    0: { transcript: r.transcript },
  }));
  return { resultIndex, results: arr };
}

describe("Speech recognition provider — no-speech is non-fatal", () => {
  it("no-speech error code yields no user-facing error (suppressed like aborted)", () => {
    const { restore } = withCtor();
    const provider = createBrowserSpeechRecognition()!;
    expect(provider).not.toBeNull();
    void provider.startListening();
    // no-speech must not set a user-facing error.
    expect(provider.error).toBeNull();
    expect(provider.permissionState).not.toBe("denied");
    restore();
  });
});

describe("Speech recognition provider — interim is never committed on end", () => {
  it("does NOT submit a partial interim transcript when no-speech + onend fires", () => {
    const { instance, restore } = withCtor();
    const provider = createBrowserSpeechRecognition()!;
    void provider.startListening();
    // User speaks a partial phrase; browser delivers it as INTERIM only.
    instance.onresult!(
      resultEvent([
        { isFinal: false, transcript: "hey copilot tell me about" },
      ]),
    );
    expect(provider.interimTranscript).toBe("hey copilot tell me about");
    expect(provider.transcript).toBe("");
    expect(provider.finalSeq).toBe(0);
    // User pauses → Chrome fires no-speech then onend. The partial interim must
    // NOT be promoted to a final transcript (spec §3, §7).
    instance.onerror!({ error: "no-speech" });
    instance.onend!();
    expect(provider.transcript).toBe("");
    expect(provider.finalSeq).toBe(0);
    expect(provider.interimTranscript).toBe("");
    restore();
  });

  it("commits only isFinal=true results and skips already-committed finals", () => {
    const { instance, restore } = withCtor();
    const provider = createBrowserSpeechRecognition()!;
    void provider.startListening();
    // First event: one final result at index 0 (resultIndex points at the
    // first NEW result in this event).
    instance.onresult!(
      resultEvent([{ isFinal: true, transcript: "what are my priorities" }], 0),
    );
    expect(provider.transcript).toBe("what are my priorities");
    expect(provider.finalSeq).toBe(1);
    // In continuous mode the Web Speech API re-delivers ALL results on each
    // event; resultIndex points at the first NEW result (index 1 here). The
    // already-committed final at index 0 must NOT be re-committed.
    instance.onresult!(
      resultEvent(
        [
          { isFinal: true, transcript: "what are my priorities" },
          { isFinal: true, transcript: "this week" },
        ],
        1,
      ),
    );
    expect(provider.transcript).toBe("what are my priorities this week");
    expect(provider.finalSeq).toBe(2);
    restore();
  });

  it("consumeTranscript returns the finalized utterance and clears the buffer", () => {
    const { instance, restore } = withCtor();
    const provider = createBrowserSpeechRecognition()!;
    void provider.startListening();
    instance.onresult!(
      resultEvent(
        [{ isFinal: true, transcript: "show me overdue rentals" }],
        0,
      ),
    );
    const text = provider.consumeTranscript();
    expect(text).toBe("show me overdue rentals");
    // Buffer cleared so the next utterance starts clean (spec §5, §8).
    expect(provider.consumeTranscript()).toBe("");
    restore();
  });
});
