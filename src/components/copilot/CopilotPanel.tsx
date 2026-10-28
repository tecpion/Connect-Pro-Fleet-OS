// Connect Pro Fleet — Copilot chat panel (Build #29 / #37 Action Center / #38–#40 Voice).
//
// The conversational surface. All answers come from the deterministic engine
// (no LLM in Phase 1). Mobile-first: full-screen sheet on small viewports,
// right drawer on desktop.
//
// Build #37 — `initialQuery` (auto-run once on mount) + `compact` embedded mode.
// Build #38 — push-to-talk dictation mic + optional "Read aloud" in Text Mode.
// Build #39 — True Voice Conversation: a dedicated Voice Mode screen driven by
// a conversational state machine (auto-submit + auto-speak + auto-listen-again).
// Build #40 — DUAL voice experience: the small composer mic is DICTATION (speech
// → editable text in the composer → manual Send), while a distinct "Start Voice
// Conversation" action enters true conversational Voice Mode (auto-submit +
// auto-speak + auto-listen-again). Both share the same engine + conversation.

import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Sparkles } from "lucide-react";
import { useCopilotSources } from "@/lib/useCopilotSources";
import {
  resolveCopilotQuery,
  resolveCopilotQueryAsync,
  type CopilotEngineContext,
} from "@/lib/copilotEngine";
import {
  resolveCopilotQueryWithDebug,
  resolveCopilotQueryAsyncWithDebug,
  useCopilotDebugEnabled,
} from "@/lib/copilot/copilotDebug";
import { buildStarterPrompts } from "@/lib/copilotPrompts";
import { nextMessageId, _resetMessageIdSeq } from "@/lib/copilotShared";
import {
  useCopilotVoice,
  CopilotVoiceProvider,
  useOptionalCopilotVoice,
} from "@/lib/copilotVoiceContext";
import { useCopilotVoiceInput } from "@/lib/useCopilotVoiceInput";
import { useVoiceConversation } from "@/lib/useVoiceConversation";
import { buildCopilotSpokenResponse } from "@/lib/copilotVoiceSpeech";
import type {
  CopilotAnswer,
  CopilotConversation,
  CopilotMessage,
  CopilotViewerPermissions,
} from "@/lib/copilotTypes";
import { VoiceModeScreen } from "@/components/copilot/VoiceModeScreen";
import { CopilotTextBody } from "@/components/copilot/CopilotTextBody";
import { cn } from "@/lib/utils";

function newConversation(): CopilotConversation {
  return {
    id: `conv_${Date.now()}`,
    messages: [],
    context_customer_id: null,
    context_vehicle_id: null,
    context_rental_id: null,
    context_label: null,
    created_at: new Date().toISOString(),
  };
}

export interface CopilotPanelProps {
  initialContext?: {
    customerId?: string | null;
    vehicleId?: string | null;
    rentalId?: string | null;
    label?: string | null;
  };
  initialQuery?: string | null;
  compact?: boolean;
  onClose?: () => void;
  embedded?: boolean;
}

/** Update conversation context after an answer (sets entity context when the
 *  query named a single entity). */
function updateConversationContextForAnswer(
  conv: CopilotConversation,
  answer: CopilotAnswer,
): CopilotConversation {
  if (
    answer.answer_type === "disambiguation" ||
    answer.answer_type === "fallback"
  ) {
    return conv;
  }
  const firstSource = answer.sources[0];
  if (!firstSource) return conv;
  if (firstSource.entity_type === "customer") {
    return {
      ...conv,
      context_customer_id: firstSource.entity_id,
      context_label: firstSource.label,
    };
  }
  if (firstSource.entity_type === "vehicle") {
    return {
      ...conv,
      context_vehicle_id: firstSource.entity_id,
      context_label: firstSource.label,
    };
  }
  if (firstSource.entity_type === "rental") {
    return {
      ...conv,
      context_rental_id: firstSource.entity_id,
      context_label: firstSource.label,
    };
  }
  return conv;
}

/** Inner panel — must be rendered inside a CopilotVoiceProvider. */
function CopilotPanelInner({
  initialContext,
  initialQuery,
  compact,
  onClose,
  embedded,
}: CopilotPanelProps) {
  const { sources, perms, staffId, tenantId, allowedLocationIds, tz } =
    useCopilotSources();
  // Build #53 — INTERNAL debug flag (localStorage, default OFF). When ON the
  // resolvers return a routing-debug trace alongside the (unchanged) answer.
  const debugEnabled = useCopilotDebugEnabled();
  const { recognition, synthesis, settings } = useCopilotVoice();
  const [conversation, setConversation] = useState<CopilotConversation>(() => ({
    ...newConversation(),
    context_customer_id: initialContext?.customerId ?? null,
    context_vehicle_id: initialContext?.vehicleId ?? null,
    context_rental_id: initialContext?.rentalId ?? null,
    context_label: initialContext?.label ?? null,
  }));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const didAutoRun = useRef(false);

  // Build #38 — optional Read aloud in Text Mode (auto-play off by default).
  const speakAnswer = useCallback(
    (answer: CopilotAnswer) => {
      if (!synthesis || !synthesis.supported) return;
      if (!settings.readResponsesAloud) return;
      synthesis.speak(buildCopilotSpokenResponse(answer, perms));
    },
    [synthesis, settings.readResponsesAloud, perms],
  );
  const stopSpeaking = useCallback(() => {
    synthesis?.stop();
  }, [synthesis]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  useEffect(() => {
    if (!synthesis) return;
    return synthesis.subscribe(() => setIsSpeaking(synthesis.speaking));
  }, [synthesis]);

  // Build #39 — True Voice Conversation. Shares the SAME conversation + engine
  // as Text Mode (unified history). Auto-submit + auto-speak + auto-listen.
  // Created BEFORE the dictation hook so the dictation hook can read the
  // current Voice Mode active state (via the exposed activeRef) and avoid
  // stealing the recognition transcript while a Voice Conversation owns it.
  const appendTurn = useCallback(
    (userMsg: CopilotMessage, assistantMsg: CopilotMessage) => {
      setConversation((prev) => {
        const withUser = { ...prev, messages: [...prev.messages, userMsg] };
        const answer = assistantMsg.answer;
        const withAssistant = {
          ...withUser,
          messages: [...withUser.messages, assistantMsg],
        };
        return answer
          ? updateConversationContextForAnswer(withAssistant, answer)
          : withAssistant;
      });
    },
    [],
  );
  const voiceConv = useVoiceConversation({
    recognition,
    synthesis,
    // Build #50 — use the async LLM-aware resolver when the feature flag is on,
    // else the synchronous deterministic resolver. The voice state machine
    // awaits a Promise<CopilotAnswer> either way; behavior is unchanged when
    // the flag is off (resolveCopilotQueryAsync falls back to deterministic).
    resolveQuery: (q, conv) => {
      // V1 Telematics — thread the raw query onto the engine context so
      // vehicle-scoped telematics handlers can resolve a vehicle by
      // plate/unit number from the query text. Optional field not declared on
      // CopilotEngineContext; the company dispatch reads it via structural cast.
      const ctx: CopilotEngineContext = {
        ...engineCtx,
        rawQuery: q,
      } as CopilotEngineContext;
      return settings.llmRoutingEnabled
        ? resolveCopilotQueryAsync(q, conv, ctx)
        : resolveCopilotQuery(q, conv, ctx);
    },
    buildSpoken: (a) => buildCopilotSpokenResponse(a, perms),
    conversation,
    appendTurn,
    enabled: settings.voiceConversationsEnabled,
  });

  // Build #40 — Dictation mic (Voice-to-Text). The small composer mic dictates
  // speech into the textarea for review/edit; it never auto-submits. This is
  // SEPARATE from the Voice Conversation button which enters true Voice Mode.
  // `disabled` is set while a Voice Conversation is active so the dictation
  // subscriber does NOT consume the recognition transcript — Voice Mode owns it
  // and auto-submits (spec §5 — one utterance → one submission). We pass the
  // voice-conversation activeRef directly so the dictation hook reads the LIVE
  // value (set synchronously in startVoice/endVoice, before any re-render).
  const dictation = useCopilotVoiceInput({
    recognition,
    synthesis,
    settings,
    onTranscript: (text) =>
      setInput((prev) => (prev ? `${prev} ${text}` : text)),
    disabledRef: voiceConv.activeRef,
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (el && typeof el.scrollTo === "function") {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [conversation.messages.length, loading]);

  const engineCtx: CopilotEngineContext = useMemo(
    () => ({
      src: sources,
      asOf: new Date(),
      perms,
      staffId,
      tenantId,
      allowedLocationIds,
      tz,
    }),
    [sources, perms, staffId, tenantId, allowedLocationIds, tz],
  );

  const runQuery = useCallback(
    async (query: string) => {
      if (!query.trim()) return;
      stopSpeaking();
      const userMsg: CopilotMessage = {
        id: nextMessageId(),
        role: "user",
        content: query,
        created_at: new Date().toISOString(),
        status: "complete",
      };
      setConversation((prev) => ({
        ...prev,
        messages: [...prev.messages, userMsg],
      }));
      setInput("");
      setLoading(true);

      // Build #50 — resolve through the async LLM-aware resolver when the
      // feature flag is on, else the synchronous deterministic resolver. Both
      // paths feed the SAME handlers; the structured answer is authoritative.
      // Build #53 — when the INTERNAL debug flag is on, use the *WithDebug
      // variants which return the SAME answer plus a routing-debug trace.
      // The trace is stamped on the assistant message and rendered by the
      // internal panel; it never alters the answer or routing.
      const ctx: CopilotEngineContext = {
        ...engineCtx,
        rawQuery: query,
      } as CopilotEngineContext;
      const { answer, debug } = debugEnabled
        ? settings.llmRoutingEnabled
          ? await resolveCopilotQueryAsyncWithDebug(query, conversation, ctx)
          : resolveCopilotQueryWithDebug(query, conversation, ctx)
        : {
            answer: await (settings.llmRoutingEnabled
              ? resolveCopilotQueryAsync(query, conversation, ctx)
              : Promise.resolve(resolveCopilotQuery(query, conversation, ctx))),
            debug: null,
          };
      const assistantMsg: CopilotMessage = {
        id: nextMessageId(),
        role: "assistant",
        content: answer.summary,
        created_at: new Date().toISOString(),
        status: "complete",
        answer_type: answer.answer_type,
        intent: answer.intent,
        sources: answer.sources,
        suggested_actions: answer.suggested_actions,
        answer,
        feedback: null,
        routing_debug: debug ?? null,
      };
      setConversation((prev) => {
        const next = { ...prev, messages: [...prev.messages, assistantMsg] };
        return updateConversationContextForAnswer(next, answer);
      });
      setLoading(false);
      if (settings.autoPlaySpokenResponses) {
        speakAnswer(answer);
      }
    },
    [
      stopSpeaking,
      conversation,
      engineCtx,
      debugEnabled,
      settings.llmRoutingEnabled,
      settings.autoPlaySpokenResponses,
      speakAnswer,
    ],
  );

  // Auto-run a starter query once on mount.
  useEffect(() => {
    if (didAutoRun.current) return;
    if (!initialQuery || !initialQuery.trim()) return;
    didAutoRun.current = true;
    const t = setTimeout(() => runQuery(initialQuery), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  const clearConversation = useCallback(() => {
    _resetMessageIdSeq();
    setConversation(newConversation());
  }, []);

  const refreshLastAnswer = useCallback(() => {
    const lastUser = [...conversation.messages]
      .reverse()
      .find((m) => m.role === "user");
    if (lastUser) runQuery(lastUser.content);
  }, [conversation.messages, runQuery]);

  const setFeedback = useCallback(
    (messageId: string, rating: "helpful" | "not_helpful") => {
      setConversation((prev) => ({
        ...prev,
        messages: prev.messages.map((m) =>
          m.id === messageId
            ? { ...m, feedback: m.feedback === rating ? null : rating }
            : m,
        ),
      }));
    },
    [],
  );

  const voiceActive = voiceConv.state.active && voiceConv.state.supported;

  return (
    <div
      className={cn(
        "flex h-full flex-col bg-background",
        embedded ? "w-full" : "w-full sm:w-[420px]",
      )}
    >
      {voiceActive ? (
        <VoiceModeScreen
          state={voiceConv.state}
          onEndVoice={voiceConv.endVoice}
        />
      ) : (
        <CopilotTextBody
          conversation={conversation}
          compact={compact}
          scrollRef={scrollRef}
          loading={loading}
          perms={perms}
          runQuery={runQuery}
          setFeedback={setFeedback}
          settings={settings}
          synthesis={synthesis}
          isSpeaking={isSpeaking}
          speakAnswer={speakAnswer}
          stopSpeaking={stopSpeaking}
          input={input}
          setInput={setInput}
          onClose={onClose}
          clearConversation={clearConversation}
          refreshLastAnswer={refreshLastAnswer}
          voiceConv={voiceConv}
          dictation={dictation}
          setConversation={setConversation}
          EmptyState={EmptyState}
        />
      )}
    </div>
  );
}

/** Public panel — wraps the inner panel in a CopilotVoiceProvider ONLY when no
 *  voice provider exists above. */
export function CopilotPanel(props: CopilotPanelProps) {
  const existing = useOptionalCopilotVoice();
  if (existing) return <CopilotPanelInner {...props} />;
  return (
    <CopilotVoiceProvider>
      <CopilotPanelInner {...props} />
    </CopilotVoiceProvider>
  );
}

function EmptyState({
  onPick,
  perms,
  compact,
}: {
  onPick: (q: string) => void;
  perms: CopilotViewerPermissions;
  compact?: boolean;
}) {
  const categories = buildStarterPrompts(perms);
  return (
    <div className={cn("space-y-4", compact ? "py-2" : "py-4")}>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Ask Connect Pro</p>
        <p className="text-xs text-muted-foreground">
          Ask questions about your fleet, rentals, payments, maintenance, or
          operations.
        </p>
      </div>
      {categories.map((cat) => (
        <div key={cat.label} className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {cat.label}
          </p>
          <div className="flex flex-wrap gap-2">
            {cat.prompts.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => onPick(p.query)}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted/40"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="pt-1 text-[11px] text-muted-foreground">
        Answers are deterministic and grounded in your Fleet data.
      </p>
    </div>
  );
}
