// Connect Pro Fleet — Copilot Voice test harness (Build #38). NON-test module.
//
// Deterministic mock speech-recognition + speech-synthesis providers + helpers
// for rendering the CopilotPanel with voice adapters under test. No
// `describe`/`it`/`expect` live here so importing never re-registers tests.

import type { ReactNode } from "react";
import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StoreProvider } from "@/lib/store";
import { CompanyPolicyProvider } from "@/lib/store/companyPolicyStore";
import { BillingProvider } from "@/lib/billingStore";
import { InvestorProvider } from "@/lib/investorStore";
import { PartnershipProvider } from "@/lib/partnershipStore";
import { DamageClaimProvider } from "@/lib/damageClaimStoreProvider";
import { ViolationPolicyProvider } from "@/lib/violationPolicyStore";
import { ViolationProvider } from "@/lib/violationStoreProvider";
import { ComplianceProvider } from "@/lib/complianceStoreProvider";
import { StaffAssignmentProvider } from "@/lib/staffAssignmentStore";
import { CustomerNotesProvider } from "@/lib/customerNoteStore";
import { IncidentsProvider } from "@/lib/incidentsStore";
import { DefenseProvider } from "@/lib/store/defenseStore";
import { CopilotVoiceProvider } from "@/lib/copilotVoiceContext";
import type { CopilotSpeechRecognitionProvider } from "@/lib/copilotVoiceSpeechRecognition";
import type { CopilotSpeechSynthesisProvider } from "@/lib/copilotVoiceSpeechSynthesis";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";

/** A controllable mock recognition provider (Build #39 conversational). */
export function makeMockRecognition(
  opts: {
    supported?: boolean;
    permissionState?: "granted" | "denied" | "prompt" | "unknown";
  } = {},
): MockRecognitionProvider {
  return new MockRecognitionProvider(
    opts.supported ?? true,
    opts.permissionState ?? "granted",
  );
}

export class MockRecognitionProvider implements CopilotSpeechRecognitionProvider {
  supported: boolean;
  permissionState: "granted" | "denied" | "prompt" | "unknown";
  isListening = false;
  transcript = "";
  interimTranscript = "";
  error: string | null = null;
  finalSeq = 0;
  desiredActive = false;
  endReason:
    import("@/lib/copilotVoiceSpeechRecognition").SpeechEndReason | null = null;
  private listeners = new Set<() => void>();
  startCalls = 0;
  stopCalls = 0;
  disposeCalls = 0;
  consumeCalls = 0;

  constructor(
    supported = true,
    permissionState: "granted" | "denied" | "prompt" | "unknown" = "granted",
  ) {
    this.supported = supported;
    this.permissionState = permissionState;
  }

  /** Notify all subscribers (exposed for tests that need to re-emit a stale
   *  event to verify no duplicate submission / no restart loop). */
  emit() {
    for (const l of this.listeners) l();
  }

  startListening(): Promise<boolean> {
    // Double-start guard (mirrors the browser adapter): no-op + no counter
    // bump when already listening.
    if (this.isListening) return Promise.resolve(true);
    this.startCalls++;
    if (this.permissionState === "denied") {
      this.desiredActive = false;
      this.endReason = "error";
      this.error =
        "Microphone access is turned off. You can enable it in your browser settings or type your question instead.";
      this.emit();
      return Promise.resolve(false);
    }
    this.desiredActive = true;
    this.endReason = null;
    this.error = null;
    // Each turn starts clean — clear the prior utterance buffer so a restarted
    // recognition session never re-emits the previous transcript (spec §8).
    this.transcript = "";
    this.isListening = true;
    this.emit();
    return Promise.resolve(true);
  }

  stopListening() {
    this.stopCalls++;
    this.desiredActive = false;
    const wasListening = this.isListening;
    this.isListening = false;
    this.interimTranscript = "";
    this.endReason = wasListening ? "explicit_stop" : "explicit_stop";
    this.emit();
  }

  /** Test helper: simulate a brand-new final transcript arriving (bumps
   *  finalSeq). In continuous mode the recognizer stays listening; pass
   *  `end: true` to also end the session (push-to-talk commit behavior). */
  deliverTranscript(text: string, opts: { end?: boolean } = {}) {
    this.transcript = this.transcript ? `${this.transcript} ${text}` : text;
    this.finalSeq += 1;
    this.interimTranscript = "";
    if (opts.end) {
      this.isListening = false;
      this.endReason = this.desiredActive ? "natural" : "explicit_stop";
    }
    this.emit();
  }

  /** Test helper: deliver a final transcript AND end the session naturally
   *  (the conversational Voice Mode path: phrase complete → onend). */
  deliverFinalAndEnd(text: string) {
    this.transcript = this.transcript ? `${this.transcript} ${text}` : text;
    this.finalSeq += 1;
    this.interimTranscript = "";
    this.isListening = false;
    this.endReason = this.desiredActive ? "natural" : "explicit_stop";
    this.emit();
  }

  /** Test helper: simulate the recognition session ending naturally (phrase
   *  complete, still desired active). */
  deliverNaturalEnd() {
    this.isListening = false;
    this.endReason = this.desiredActive ? "natural" : "explicit_stop";
    this.emit();
  }

  /** Test helper: simulate an interim partial result. */
  deliverInterim(text: string) {
    this.interimTranscript = text;
    this.emit();
  }

  /** Test helper: simulate a no-speech / error. */
  deliverError(message: string) {
    this.error = message;
    this.isListening = false;
    this.endReason = "error";
    this.emit();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Consume + clear the finalized transcript for the current utterance.
   *  Mirrors the browser provider — returns the committed text and resets the
   *  buffer so the next utterance starts clean (spec §5, §8). */
  consumeTranscript(): string {
    this.consumeCalls++;
    const text = this.transcript;
    this.transcript = "";
    return text;
  }

  dispose() {
    this.disposeCalls++;
    this.desiredActive = false;
    this.isListening = false;
    this.interimTranscript = "";
    this.endReason = "disposed";
    this.emit();
  }
}

/** A controllable mock synthesis provider (Build #39 conversational). */
export function makeMockSynthesis(
  opts: { supported?: boolean } = {},
): MockSynthesisProvider {
  return new MockSynthesisProvider(opts.supported ?? true);
}

export class MockSynthesisProvider implements CopilotSpeechSynthesisProvider {
  supported: boolean;
  speaking = false;
  spokenSeq = 0;
  interrupted = false;
  spokenTexts: string[] = [];
  stopCalls = 0;
  availableVoices: import("@/lib/copilotVoiceSpeechSynthesis").SpeechVoice[] =
    [];
  selectedVoiceLabel = "Mock Voice";
  private listeners = new Set<() => void>();

  constructor(supported = true) {
    this.supported = supported;
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  speak(text: string) {
    if (!this.supported) return;
    this.spokenTexts.push(text);
    this.spokenSeq += 1;
    this.interrupted = false;
    this.speaking = true;
    this.emit();
  }

  /** Test helper: simulate the utterance finishing naturally. */
  finishSpeaking() {
    this.speaking = false;
    this.interrupted = false;
    this.emit();
  }

  stop() {
    this.stopCalls++;
    if (this.speaking) this.interrupted = true;
    this.speaking = false;
    this.emit();
  }

  pause() {}
  resume() {}

  setPreferences(
    _prefs: import("@/lib/copilotVoiceSpeechSynthesis").SpeechPreferences,
  ) {
    // Mock — no-op for tests.
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function Providers({
  children,
  recognition,
  synthesis,
}: {
  children: ReactNode;
  recognition?: MockRecognitionProvider | null;
  synthesis?: MockSynthesisProvider | null;
}) {
  return (
    <StoreProvider>
      <CompanyPolicyProvider>
        <BillingProvider>
          <IncidentsProvider>
            <DefenseProvider>
              <InvestorProvider>
                <PartnershipProvider>
                  <DamageClaimProvider>
                    <StaffAssignmentProvider>
                      <ViolationPolicyProvider>
                        <ViolationProvider>
                          <ComplianceProvider>
                            <CustomerNotesProvider>
                              <CopilotVoiceProvider
                                recognitionOverride={recognition}
                                synthesisOverride={synthesis}
                              >
                                {children}
                              </CopilotVoiceProvider>
                            </CustomerNotesProvider>
                          </ComplianceProvider>
                        </ViolationProvider>
                      </ViolationPolicyProvider>
                    </StaffAssignmentProvider>
                  </DamageClaimProvider>
                </PartnershipProvider>
              </InvestorProvider>
            </DefenseProvider>
          </IncidentsProvider>
        </BillingProvider>
      </CompanyPolicyProvider>
    </StoreProvider>
  );
}

/** Render a CopilotPanel with mock voice adapters. Returns the panel + mocks. */
export function renderVoicePanel(opts: {
  recognition?: MockRecognitionProvider | null;
  synthesis?: MockSynthesisProvider | null;
  initialContext?: {
    customerId?: string | null;
    vehicleId?: string | null;
    rentalId?: string | null;
    label?: string | null;
  };
  initialQuery?: string | null;
}) {
  const recognition = opts.recognition ?? makeMockRecognition();
  const synthesis = opts.synthesis ?? makeMockSynthesis();
  const result = render(
    <MemoryRouter>
      <Providers recognition={recognition} synthesis={synthesis}>
        <CopilotPanel
          embedded
          initialContext={opts.initialContext}
          initialQuery={opts.initialQuery}
        />
      </Providers>
    </MemoryRouter>,
  );
  return { ...result, recognition, synthesis };
}

/** Allow act-wrapped async mic start to flush. */
export async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}
