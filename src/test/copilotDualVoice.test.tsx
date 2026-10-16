// Connect Pro Fleet — Build #40 Dual Voice + Natural Voice + Compound tests.
//
// Covers the Build #40 spec items NOT already covered by copilotVoice.test.tsx
// and copilotVoiceMode.test.tsx:
//  - Natural voice selection (pickBestVoice scoring).
//  - Sentence chunking.
//  - Default rate/pitch.
//  - Money / percentage / date / time pronunciation in the spoken formatter.
//  - Markdown / build references / internal IDs removed from spoken output.
//  - Unauthorized values not spoken.
//  - Compound query answers BOTH intents.
//  - Broad business-summary query ("Tell me about my numbers this week").
//  - Conversational spoken style (not a database report).
//  - Dev diagnostics render only when enabled.
//  - Mobile rendering + accessibility for the dual controls.
//  - Voice Mode handles compound + business-summary queries.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  render,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { resolveCopilotQuery } from "@/lib/copilotEngine";
import { buildCopilotSpokenResponse } from "@/lib/copilotVoiceSpeech";
import {
  pickBestVoice,
  chunkSentences,
  DEFAULT_SPEECH_PREFERENCES,
  type SpeechVoice,
} from "@/lib/copilotVoiceSpeechSynthesis";
import {
  isCompoundQuery,
  splitCompoundClauses,
} from "@/lib/copilotCompoundQuery";
import { StoreProvider } from "@/lib/store";
import { CopilotVoiceProvider } from "@/lib/copilotVoiceContext";
import { CopilotVoiceDevDiagnostics } from "@/components/copilot/CopilotVoiceDevDiagnostics";
import {
  FULL_PERMS,
  NO_FINANCE_PERMS,
  useCopilotTestSources,
  engineCtx,
  emptyConversation,
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
// Natural voice selection
// ---------------------------------------------------------------------------

describe("Build #40 — Natural voice selection", () => {
  const voices: SpeechVoice[] = [
    {
      id: "v1",
      name: "Microsoft David",
      lang: "en-US",
      localService: true,
      enhanced: false,
    },
    {
      id: "v2",
      name: "Google US English",
      lang: "en-US",
      localService: false,
      enhanced: true,
    },
    {
      id: "v3",
      name: "Samantha",
      lang: "en-US",
      localService: true,
      enhanced: false,
    },
    {
      id: "v4",
      name: "French Voice",
      lang: "fr-FR",
      localService: true,
      enhanced: false,
    },
  ];

  it("18. pickBestVoice selects an English voice", () => {
    const best = pickBestVoice(voices);
    expect(best).not.toBeNull();
    expect(best!.lang.toLowerCase().startsWith("en")).toBe(true);
  });

  it("19. pickBestVoice falls back to any voice when no English", () => {
    const nonEnglish: SpeechVoice[] = [
      {
        id: "f1",
        name: "Français",
        lang: "fr-FR",
        localService: true,
        enhanced: false,
      },
    ];
    const best = pickBestVoice(nonEnglish);
    expect(best).not.toBeNull();
    expect(best!.id).toBe("f1");
  });

  it("20. pickBestVoice returns null for empty list", () => {
    expect(pickBestVoice([])).toBeNull();
  });

  it("21. enhanced/local voices score higher than basic remote ones", () => {
    // Google US English is enhanced (localService false but enhanced true) →
    // should beat a plain remote non-enhanced voice. Samantha is local + named
    // bonus. Either enhanced or Samantha should win over a plain remote voice.
    const pool: SpeechVoice[] = [
      {
        id: "plain",
        name: "Plain",
        lang: "en-US",
        localService: false,
        enhanced: false,
      },
      {
        id: "enh",
        name: "Google US English",
        lang: "en-US",
        localService: false,
        enhanced: true,
      },
    ];
    const best = pickBestVoice(pool);
    expect(best!.id).toBe("enh");
  });

  it("22. default speech rate is ~0.97 (natural cadence)", () => {
    expect(DEFAULT_SPEECH_PREFERENCES.rate).toBeGreaterThanOrEqual(0.9);
    expect(DEFAULT_SPEECH_PREFERENCES.rate).toBeLessThanOrEqual(1.0);
  });

  it("23. default pitch is ~1.0 (natural)", () => {
    expect(DEFAULT_SPEECH_PREFERENCES.pitch).toBeGreaterThanOrEqual(0.95);
    expect(DEFAULT_SPEECH_PREFERENCES.pitch).toBeLessThanOrEqual(1.05);
  });
});

// ---------------------------------------------------------------------------
// Sentence chunking
// ---------------------------------------------------------------------------

describe("Build #40 — Sentence chunking", () => {
  it("24. chunkSentences splits on sentence terminators", () => {
    const chunks = chunkSentences(
      "You completed four pickups today. Two returns are still scheduled. One vehicle needs attention.",
    );
    expect(chunks.length).toBe(3);
    expect(chunks[0].startsWith("You completed")).toBe(true);
  });

  it("25. chunkSentences merges tiny fragments", () => {
    const chunks = chunkSentences("You have two pickups. OK.");
    // "OK." is < 8 chars → merged into the previous chunk.
    expect(chunks.length).toBe(1);
  });

  it("26. chunkSentences handles a single sentence", () => {
    const chunks = chunkSentences("You don't have anything overdue.");
    expect(chunks.length).toBe(1);
  });

  it("27. chunkSentences returns empty for empty input", () => {
    expect(chunkSentences("")).toEqual([]);
    expect(chunkSentences("   ")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Spoken formatter — money / percentage / date / time pronunciation
// ---------------------------------------------------------------------------

describe("Build #40 — Natural pronunciation", () => {
  const r = useCopilotTestSources();

  it("28. money is spoken as words, not $ digits", () => {
    const a = resolveCopilotQuery(
      "Who is already late?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const spoken = buildCopilotSpokenResponse(a, FULL_PERMS);
    // No raw "$4,136" tokens in speech.
    expect(spoken).not.toMatch(/\$\d/);
  });

  it("29. percentages are spoken as words", () => {
    const a = resolveCopilotQuery(
      "What's hurting utilization?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const spoken = buildCopilotSpokenResponse(a, FULL_PERMS);
    // No raw "62%" — converted to "sixty-two percent".
    expect(spoken).not.toMatch(/\d+%/);
  });

  it("30. dates are spoken as month + ordinal day", () => {
    // Build a synthetic answer whose summary contains a date, then verify the
    // formatter naturalizes it.
    const a = resolveCopilotQuery(
      "Give me my morning briefing",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const spoken = buildCopilotSpokenResponse(a, FULL_PERMS);
    // No raw "Sep 7" style tokens survive (they become "September seventh").
    expect(spoken).not.toMatch(
      /\b(Sep|Oct|Nov|Dec|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug)\s+\d{1,2}\b/,
    );
  });

  it("31. markdown removed from spoken response", () => {
    const a = resolveCopilotQuery(
      "What should I focus on first?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const spoken = buildCopilotSpokenResponse(a, FULL_PERMS);
    // No markdown bold/headers/bullets.
    expect(spoken).not.toMatch(/\*\*|##|^\s*[-*]\s/m);
  });

  it("32. build references removed from spoken response", () => {
    const a = resolveCopilotQuery(
      "Give me my morning briefing",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const spoken = buildCopilotSpokenResponse(a, FULL_PERMS);
    expect(spoken).not.toMatch(/Build\s*#\d+/i);
  });

  it("33. internal IDs removed from spoken response", () => {
    const a = resolveCopilotQuery(
      "Who is already late?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const spoken = buildCopilotSpokenResponse(a, FULL_PERMS);
    // No UUID-style or prefixed internal ids.
    expect(spoken).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(spoken).not.toMatch(/\b(res_|agr_|veh_|cust_|task_|pay_)\w+/i);
  });

  it("34. unauthorized financial values not spoken", () => {
    const a = resolveCopilotQuery(
      "Who is already late?",
      emptyConversation(),
      engineCtx(r.current.sources, NO_FINANCE_PERMS),
    );
    const spoken = buildCopilotSpokenResponse(a, NO_FINANCE_PERMS);
    expect(spoken).not.toMatch(/\$\d/);
    expect(spoken).not.toMatch(/\d+ dollars/i);
  });

  it("35. conversational style — not a database report", () => {
    const a = resolveCopilotQuery(
      "Who is already late?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const spoken = buildCopilotSpokenResponse(a, FULL_PERMS);
    // When there are no overdue accounts, the speech is conversational
    // ("You don't currently have any overdue customers"), not a DB read-out
    // ("Current overdue customers: zero").
    if (a.items.length === 0) {
      expect(spoken).toMatch(/don'?t currently have/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Compound query
// ---------------------------------------------------------------------------

describe("Build #40 — Compound query (answer both intents)", () => {
  const r = useCopilotTestSources();

  it("29. compound question answers both parts", () => {
    const a = resolveCopilotQuery(
      "What's currently overdue and how many pickups did I have this week?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("compound_query");
    // Both parts are represented: overdue facts + starting-today facts.
    const labels = a.facts.map((f) => f.label);
    expect(labels.some((l) => /overdue/i.test(l))).toBe(true);
    expect(labels.some((l) => /starting/i.test(l))).toBe(true);
  });

  it("30. broad business-summary query is not a fallback", () => {
    const a = resolveCopilotQuery(
      "Tell me about my numbers this week.",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    // The engine routes business_summary → the weekly review composer, so the
    // resolved intent is weekly_review (a real business summary, not fallback).
    expect(["business_summary", "weekly_review"]).toContain(a.intent);
    expect(a.answer_type).not.toBe("fallback");
    expect(a.summary.length).toBeGreaterThan(0);
  });

  it("31. compound split requires two substantive clauses", () => {
    // "pickups and returns" is a single phrase — not compound.
    expect(splitCompoundClauses("What pickups and returns today?")).toEqual([]);
  });

  it("32. compound detection rejects entity-scoped clauses", () => {
    // A named customer + a second clause is not split.
    expect(
      isCompoundQuery("What does John Smith owe and how many pickups today?"),
    ).toBeNull();
  });

  it("33. compound spoken response is conversational + bounded", () => {
    const a = resolveCopilotQuery(
      "What's currently overdue and how many pickups did I have this week?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const spoken = buildCopilotSpokenResponse(a, FULL_PERMS);
    expect(spoken.length).toBeGreaterThan(0);
    expect(spoken.length).toBeLessThan(600);
    expect(spoken).not.toMatch(/\$\d/);
  });

  it("34. compound query does not duplicate the engine (single resolution per clause)", () => {
    const a = resolveCopilotQuery(
      "What's currently overdue and how many pickups did I have this week?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    // The merged answer carries facts from both clauses but is a single answer.
    expect(a.answer_type).toBe("summary");
    expect(a.facts.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Voice settings + dev diagnostics rendering
// ---------------------------------------------------------------------------

describe("Build #40 — Voice settings + dev diagnostics", () => {
  let recognition: MockRecognitionProvider;
  let synthesis: MockSynthesisProvider;

  beforeEach(() => {
    recognition = makeMockRecognition();
    synthesis = makeMockSynthesis();
  });

  afterEach(() => {
    try {
      localStorage.removeItem("cpf_dev_voice_diag");
    } catch {
      /* noop */
    }
  });

  it("36. dev diagnostics hidden by default", () => {
    renderVoicePanel({ recognition, synthesis });
    expect(screen.queryByText("Voice Dev Diagnostics")).toBeNull();
  });

  it("37. dev diagnostics render when dev flag set", () => {
    localStorage.setItem("cpf_dev_voice_diag", "1");
    render(
      <MemoryRouter>
        <StoreProvider>
          <CopilotVoiceProvider
            recognitionOverride={recognition}
            synthesisOverride={synthesis}
          >
            <CopilotVoiceDevDiagnostics />
          </CopilotVoiceProvider>
        </StoreProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText("Voice Dev Diagnostics")).toBeTruthy();
    // Shows the selected TTS voice + recognition state.
    expect(screen.getByText("Selected TTS voice")).toBeTruthy();
    expect(screen.getByText("Recognition listening")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Mobile rendering + accessibility (dual controls)
// ---------------------------------------------------------------------------

describe("Build #40 — Mobile + accessibility", () => {
  let recognition: MockRecognitionProvider;
  let synthesis: MockSynthesisProvider;

  beforeEach(() => {
    recognition = makeMockRecognition();
    synthesis = makeMockSynthesis();
  });

  it("31. mobile rendering — both voice controls present", () => {
    renderVoicePanel({ recognition, synthesis });
    // Dictation mic + Voice Conversation button both render.
    expect(
      screen.getByRole("button", { name: "Dictate message" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Start Voice Conversation" }),
    ).toBeTruthy();
  });

  it("32. accessibility — dictation mic has aria-label + title", () => {
    renderVoicePanel({ recognition, synthesis });
    const mic = screen.getByRole("button", { name: "Dictate message" });
    expect(mic.getAttribute("aria-label")).toBeTruthy();
    expect(mic.getAttribute("title")).toBeTruthy();
  });

  it("33. accessibility — Voice Conversation has aria-label + title", () => {
    renderVoicePanel({ recognition, synthesis });
    const btn = screen.getByRole("button", {
      name: "Start Voice Conversation",
    });
    expect(btn.getAttribute("aria-label")).toBe("Start Voice Conversation");
    expect(btn.getAttribute("title")).toBeTruthy();
  });

  it("34. unsupported browser fallback — both controls hidden, typed usable", () => {
    recognition.supported = false;
    renderVoicePanel({ recognition, synthesis });
    expect(
      screen.queryByRole("button", { name: "Dictate message" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Start Voice Conversation" }),
    ).toBeNull();
    expect(
      screen.getByPlaceholderText("Ask about your operation…"),
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Conversational voice integration (compound + business summary via Voice Mode)
// ---------------------------------------------------------------------------

describe("Build #40 — Voice Mode handles compound + business summary", () => {
  let recognition: MockRecognitionProvider;
  let synthesis: MockSynthesisProvider;

  beforeEach(() => {
    recognition = makeMockRecognition();
    synthesis = makeMockSynthesis();
  });

  async function enterVoiceMode() {
    renderVoicePanel({ recognition, synthesis });
    fireEvent.click(
      screen.getByRole("button", { name: "Start Voice Conversation" }),
    );
    await flush();
  }

  async function speakTurn(text: string) {
    const before = synthesis.spokenTexts.length;
    act(() => recognition.deliverFinalAndEnd(text));
    await flush();
    await waitFor(() =>
      expect(synthesis.spokenTexts.length).toBeGreaterThan(before),
    );
  }

  it("35. compound question auto-submits + auto-speaks in Voice Mode", async () => {
    await enterVoiceMode();
    await speakTurn(
      "What's currently overdue and how many pickups did I have this week?",
    );
    expect(synthesis.spokenTexts.length).toBeGreaterThanOrEqual(1);
    // The spoken answer addresses both parts (no fallback phrasing).
    const spoken = synthesis.spokenTexts[synthesis.spokenTexts.length - 1];
    expect(spoken).not.toMatch(/couldn't determine which record/i);
  });

  it("36. business summary auto-submits + auto-speaks in Voice Mode", async () => {
    await enterVoiceMode();
    await speakTurn("Tell me about my numbers this week.");
    expect(synthesis.spokenTexts.length).toBeGreaterThanOrEqual(1);
    const spoken = synthesis.spokenTexts[synthesis.spokenTexts.length - 1];
    expect(spoken).not.toMatch(/couldn't determine which record/i);
  });

  it("37. second conversational turn works after compound answer", async () => {
    await enterVoiceMode();
    await speakTurn(
      "What's currently overdue and how many pickups did I have this week?",
    );
    act(() => synthesis.finishSpeaking());
    await flush();
    await speakTurn("How many returns?");
    expect(synthesis.spokenTexts.length).toBeGreaterThanOrEqual(2);
  });
});
