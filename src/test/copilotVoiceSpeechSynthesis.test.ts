// Connect Pro Fleet — Browser speech-synthesis adapter regression tests.
//
// The mock synthesis provider (copilotVoiceTestHarness) has finishSpeaking(),
// so the conversational Voice Mode tests pass even if the REAL browser adapter
// is broken. These tests exercise createBrowserSpeechSynthesis() against a
// fake window.speechSynthesis that mimics Chrome's real behavior — including
// the "cancel() then speak() in the same tick silently drops the utterance"
// race that caused the orb to freeze on "Speaking…" with no audio.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { createBrowserSpeechSynthesis } from "@/lib/copilotVoiceSpeechSynthesis";

/** A fake SpeechSynthesisUtterance. The adapter assigns onstart/onend/onerror. */
class FakeUtterance {
  text: string;
  voice: unknown = null;
  rate = 1;
  pitch = 1;
  lang = "en-US";
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

type DropMode = "cancel-tick" | "always" | "never";

/** A fake window.speechSynthesis that simulates Chrome's drop behavior. */
function makeFakeSynth(mode: DropMode) {
  let cancelPending = false;
  let pendingTimers: ReturnType<typeof setTimeout>[] = [];
  const startedTexts: string[] = [];
  const spokenTexts: string[] = [];
  let cancelCalls = 0;

  function clearPending() {
    pendingTimers.forEach((t) => clearTimeout(t));
    pendingTimers = [];
  }

  const fake = {
    speak(u: FakeUtterance) {
      if (mode === "always") return; // always dropped — never fires onstart/onend
      if (mode === "cancel-tick" && cancelPending) return; // dropped by the race
      clearPending();
      startedTexts.push(u.text);
      pendingTimers.push(setTimeout(() => u.onstart?.(), 5));
      pendingTimers.push(
        setTimeout(() => {
          spokenTexts.push(u.text);
          u.onend?.();
        }, 15),
      );
    },
    cancel() {
      cancelCalls += 1;
      if (mode === "cancel-tick") {
        cancelPending = true;
        // The "same-tick" window clears on the next macrotask.
        setTimeout(() => {
          cancelPending = false;
        }, 0);
      }
      clearPending();
    },
    getVoices() {
      return [
        {
          voiceURI: "v1",
          name: "Samantha",
          lang: "en-US",
          localService: true,
        },
      ];
    },
    onvoiceschanged: null as (() => void) | null,
    speaking: false,
    pause() {},
    resume() {},
    // Test inspection.
    _startedTexts: startedTexts,
    _spokenTexts: spokenTexts,
    _cancelCalls: () => cancelCalls,
  };
  return fake;
}

function installFake(fake: ReturnType<typeof makeFakeSynth>) {
  const w = window as unknown as Record<string, unknown>;
  w.speechSynthesis = fake;
  w.SpeechSynthesisUtterance = FakeUtterance;
}

describe("createBrowserSpeechSynthesis — Chrome race + watchdog", () => {
  let origSynth: unknown;
  let origUtterance: unknown;
  let current: ReturnType<typeof createBrowserSpeechSynthesis>;

  beforeEach(() => {
    const w = window as unknown as Record<string, unknown>;
    origSynth = w.speechSynthesis;
    origUtterance = w.SpeechSynthesisUtterance;
  });

  afterEach(() => {
    // Stop the adapter first so its watchdog / resume timers are cleared and
    // any deferred speakNext() no-ops (queue emptied) — preventing a lingering
    // timer from running after globals are restored below.
    current?.stop();
    current = null;
    const w = window as unknown as Record<string, unknown>;
    w.speechSynthesis = origSynth;
    w.SpeechSynthesisUtterance = origUtterance;
    vi.useRealTimers();
  });

  it("defers speak() after cancel() so Chrome does not drop the utterance", async () => {
    // cancel-tick: an utterance queued in the SAME synchronous tick as cancel()
    // is dropped (onstart/onend never fire). The adapter must defer the first
    // speak() to the next macrotask so it is NOT in the same tick as cancel().
    const fake = makeFakeSynth("cancel-tick");
    installFake(fake);
    current = createBrowserSpeechSynthesis();
    const provider = current;
    expect(provider).not.toBeNull();
    let speaking = false;
    provider!.subscribe(() => {
      speaking = provider!.speaking;
    });

    provider!.speak("Hello world.");
    // Optimistically speaking immediately.
    expect(speaking).toBe(true);
    // The utterance must actually play (onstart fires) and finish (onend
    // fires) — proving it was NOT dropped by the cancel→speak race.
    await waitFor(() => expect(speaking).toBe(false));
    expect(fake._startedTexts).toContain("Hello world.");
    expect(fake._spokenTexts).toContain("Hello world.");
  });

  it("watchdog recovers if Chrome silently drops every utterance", async () => {
    vi.useFakeTimers();
    const fake = makeFakeSynth("always");
    installFake(fake);
    current = createBrowserSpeechSynthesis();
    const provider = current;
    expect(provider).not.toBeNull();
    let speaking = false;
    provider!.subscribe(() => {
      speaking = provider!.speaking;
    });

    provider!.speak("Hello world.");
    expect(speaking).toBe(true);
    // Advance past the 600ms watchdog (retries once, then advances past the
    // queue) so Voice Mode never stalls on "Speaking…" with no audio.
    await vi.advanceTimersByTimeAsync(1500);
    expect(speaking).toBe(false);
  });

  it("stop() cancels and resets speaking immediately", () => {
    const fake = makeFakeSynth("never");
    installFake(fake);
    current = createBrowserSpeechSynthesis();
    const provider = current;
    expect(provider).not.toBeNull();

    provider!.speak("Hello world.");
    provider!.stop();
    expect(provider!.speaking).toBe(false);
    expect(fake._cancelCalls()).toBeGreaterThanOrEqual(1);
  });

  it("chunks a long response into sentence utterances", async () => {
    const fake = makeFakeSynth("never");
    installFake(fake);
    current = createBrowserSpeechSynthesis();
    const provider = current;
    expect(provider).not.toBeNull();

    provider!.speak("First sentence. Second sentence. Third one.");
    // Each sentence becomes its own utterance that actually starts.
    await waitFor(() => expect(fake._startedTexts.length).toBe(3));
    expect(fake._startedTexts).toEqual([
      "First sentence.",
      "Second sentence.",
      "Third one.",
    ]);
  });

  it("spokenSeq increments once per speak() and is observable", () => {
    const fake = makeFakeSynth("never");
    installFake(fake);
    current = createBrowserSpeechSynthesis();
    const provider = current;
    expect(provider).not.toBeNull();
    const seqs: number[] = [];
    provider!.subscribe(() => seqs.push(provider!.spokenSeq));

    provider!.speak("One.");
    provider!.speak("Two.");
    expect(provider!.spokenSeq).toBeGreaterThanOrEqual(2);
    expect(seqs.some((s) => s >= 1)).toBe(true);
    expect(seqs.some((s) => s >= 2)).toBe(true);
  });
});
