// Connect Pro Fleet — Investor & Partner Management V1 store provider.
//
// Thin React context that owns the V1 workspace collections (agreements,
// settlements, partner meta, timeline, statement numbering) and delegates
// mutation logic to the focused agreement + settlement mutation modules.
// Composes onto the existing InvestorStore (Build #6) + PartnershipStore
// (Build #7). Does NOT duplicate investor/pairing/compensation/expense state.

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useStore } from "./store";
import { TENANT_ID } from "./store/ids";
import type { CompensationArrangement } from "./ownershipTypes";
import type { VehicleOwnershipType } from "./ownershipTypes";
import type {
  AgreementExpenseRule,
  PartnerEntityType,
  PartnerPaymentPreference,
  PartnerProfileMeta,
  PartnerRelationshipClass,
  PartnerStatus,
  PartnerTimelineEvent,
  PartnerTimelineEventType,
  PartnershipAgreement,
  SettlementFrequency,
  SettlementV1,
} from "./investorWorkspaceTypes";
import { makeTimelineEvent } from "./investorWorkspaceSelectors";
import type { SettlementReviewContext } from "./investorWorkspaceSelectors";
import {
  buildCreateAgreement,
  buildChangeAgreementTerms,
  buildEndAgreement,
  supersedeOldAgreement,
  type AgreementMutationDeps,
} from "./investorWorkspaceAgreementMutations";
import {
  buildGenerateSettlement,
  buildRecalculate,
  buildApprove,
  buildRecordPayout,
  buildReopen,
  buildVoid,
  makeNextSettlementNumber,
  type SettlementMutationDeps,
} from "./investorWorkspaceSettlementMutations";

export interface InvestorWorkspaceStore {
  agreements: PartnershipAgreement[];
  settlements: SettlementV1[];
  partnerMeta: PartnerProfileMeta[];
  timeline: PartnerTimelineEvent[];

  upsertPartnerMeta: (meta: PartnerProfileMeta) => void;
  setPartnerStatus: (investorId: string, status: PartnerStatus) => void;

  createAgreement: (input: {
    investor_id: string;
    vehicle_id: string;
    pairing_id: string;
    ownership_type: VehicleOwnershipType;
    compensation: CompensationArrangement;
    company_share_pct: number;
    partner_share_pct: number;
    expense_rules: AgreementExpenseRule[];
    settlement_frequency?: SettlementFrequency;
    payment_preference?: PartnerPaymentPreference | null;
    effective_start: string;
    notes?: string | null;
  }) => { agreement: PartnershipAgreement; errors: string[] };

  changeAgreementTerms: (
    agreementId: string,
    input: {
      compensation: CompensationArrangement;
      company_share_pct: number;
      partner_share_pct: number;
      expense_rules: AgreementExpenseRule[];
      effective_start: string;
      notes?: string | null;
    },
  ) => { agreement: PartnershipAgreement; errors: string[] };

  endAgreement: (agreementId: string, effectiveEnd: string) => void;

  generateSettlementV1: (input: {
    investor_id: string;
    vehicle_id: string;
    pairing_id: string;
    agreement_id: string;
    period_start: string;
    period_end: string;
    gross_revenue: number;
    cash_collected: number;
    included_expenses: number;
    recoveries: number;
    manual_adjustments?: number;
    manual_adjustment_note?: string | null;
  }) => { settlement: SettlementV1; errors: string[] };

  recalculateSettlement: (
    settlementId: string,
    input: {
      gross_revenue: number;
      cash_collected: number;
      included_expenses: number;
      recoveries: number;
      manual_adjustments?: number;
      manual_adjustment_note?: string | null;
    },
  ) => { settlement: SettlementV1 | null; errors: string[] };

  sendSettlementToReview: (settlementId: string) => void;
  approveSettlement: (
    settlementId: string,
    reviewCtx: SettlementReviewContext,
  ) => { settlement: SettlementV1 | null; errors: string[] };

  recordPayout: (
    settlementId: string,
    input: {
      paid_date: string;
      payment_method: PartnerPaymentPreference;
      payment_reference?: string | null;
    },
  ) => { settlement: SettlementV1 | null; errors: string[] };

  reopenSettlement: (
    settlementId: string,
    reason: string,
  ) => { settlement: SettlementV1 | null; errors: string[] };

  voidSettlement: (
    settlementId: string,
    reason: string,
  ) => { settlement: SettlementV1 | null; errors: string[] };

  nextSettlementNumber: () => string;

  logTimelineEvent: (params: {
    investor_id: string;
    event_type: PartnerTimelineEventType;
    detail?: string | null;
    vehicle_id?: string | null;
    settlement_id?: string | null;
    agreement_id?: string | null;
  }) => void;
  timelineForInvestor: (investorId: string) => PartnerTimelineEvent[];
}

const WorkspaceContext = createContext<InvestorWorkspaceStore | null>(null);

export function InvestorWorkspaceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const store = useStore();
  const staffId = store.currentStaffId;

  const [agreements, setAgreements] = useState<PartnershipAgreement[]>([]);
  const [settlements, setSettlements] = useState<SettlementV1[]>([]);
  const [partnerMeta, setPartnerMeta] = useState<PartnerProfileMeta[]>([]);
  const [timeline, setTimeline] = useState<PartnerTimelineEvent[]>([]);
  const [seqMap, setSeqMap] = useState<Map<string, number>>(new Map());

  const logTimelineEvent = useCallback(
    (params: {
      investor_id: string;
      event_type: PartnerTimelineEventType;
      detail?: string | null;
      vehicle_id?: string | null;
      settlement_id?: string | null;
      agreement_id?: string | null;
    }) => {
      const event = makeTimelineEvent({
        tenant_id: TENANT_ID,
        investor_id: params.investor_id,
        event_type: params.event_type,
        detail: params.detail,
        vehicle_id: params.vehicle_id,
        settlement_id: params.settlement_id,
        agreement_id: params.agreement_id,
        staff_id: staffId,
      });
      setTimeline((prev) => [event, ...prev]);
    },
    [staffId],
  );

  const timelineForInvestor = useCallback(
    (investorId: string) =>
      timeline.filter((t) => t.investor_id === investorId),
    [timeline],
  );

  const nextSettlementNumber = useCallback(
    makeNextSettlementNumber(seqMap, setSeqMap),
    [seqMap],
  );

  // --- Partner meta ---
  const upsertPartnerMeta = useCallback((meta: PartnerProfileMeta) => {
    setPartnerMeta((prev) => {
      const idx = prev.findIndex((m) => m.investor_id === meta.investor_id);
      if (idx === -1) return [...prev, meta];
      const copy = [...prev];
      copy[idx] = meta;
      return copy;
    });
  }, []);

  const setPartnerStatus = useCallback(
    (investorId: string, status: PartnerStatus) => {
      setPartnerMeta((prev) => {
        const existing = prev.find((m) => m.investor_id === investorId);
        if (!existing) {
          return [
            ...prev,
            {
              investor_id: investorId,
              tenant_id: TENANT_ID,
              entity_type: "individual" as PartnerEntityType,
              contact_name: null,
              relationship_class: "external" as PartnerRelationshipClass,
              status,
              payment_preference: null,
            },
          ];
        }
        return prev.map((m) =>
          m.investor_id === investorId ? { ...m, status } : m,
        );
      });
      logTimelineEvent({
        investor_id: investorId,
        event_type: "status_changed",
        detail: `Status set to ${status}`,
      });
    },
    [logTimelineEvent],
  );

  // --- Agreement mutations ---
  const agreementDeps: AgreementMutationDeps = useMemo(
    () => ({ agreements, staffId, logTimeline: logTimelineEvent }),
    [agreements, staffId, logTimelineEvent],
  );
  const createAgreement = useMemo(
    () => buildCreateAgreement(agreementDeps),
    [agreementDeps],
  );
  const changeAgreementTerms = useMemo(
    () => buildChangeAgreementTerms(agreementDeps),
    [agreementDeps],
  );
  const endAgreementFn = useMemo(
    () => buildEndAgreement(agreementDeps),
    [agreementDeps],
  );

  const createAgreementWrapped = useCallback(
    (input: Parameters<typeof createAgreement>[0]) => {
      const result = createAgreement(input);
      if (result.agreement) {
        setAgreements((prev) => [result.agreement, ...prev]);
      }
      return result;
    },
    [createAgreement],
  );

  const changeAgreementTermsWrapped = useCallback(
    (
      agreementId: string,
      input: Parameters<typeof changeAgreementTerms>[1],
    ) => {
      const result = changeAgreementTerms(agreementId, input);
      if (result.agreement) {
        setAgreements((prev) => [
          result.agreement,
          ...prev.map(
            supersedeOldAgreement(
              agreementId,
              input.effective_start,
              result.agreement.id,
            ),
          ),
        ]);
      }
      return result;
    },
    [changeAgreementTerms],
  );

  const endAgreement = useCallback(
    (agreementId: string, effectiveEnd: string) => {
      const result = endAgreementFn(agreementId, effectiveEnd);
      if (result) {
        setAgreements((prev) => prev.map(result.patch));
      }
    },
    [endAgreementFn],
  );

  // --- Settlement mutations ---
  const settlementDeps: SettlementMutationDeps = useMemo(
    () => ({
      agreements,
      settlements,
      staffId,
      nextSettlementNumber,
      logTimeline: logTimelineEvent,
    }),
    [agreements, settlements, staffId, nextSettlementNumber, logTimelineEvent],
  );
  const generateSettlementV1 = useMemo(
    () => buildGenerateSettlement(settlementDeps),
    [settlementDeps],
  );
  const recalculateSettlement = useMemo(
    () => buildRecalculate(settlementDeps),
    [settlementDeps],
  );
  const approveSettlement = useMemo(
    () => buildApprove(settlementDeps),
    [settlementDeps],
  );
  const recordPayout = useMemo(
    () => buildRecordPayout(settlementDeps),
    [settlementDeps],
  );
  const reopenSettlement = useMemo(
    () => buildReopen(settlementDeps),
    [settlementDeps],
  );
  const voidSettlement = useMemo(
    () => buildVoid(settlementDeps),
    [settlementDeps],
  );

  const generateSettlementWrapped = useCallback(
    (input: Parameters<typeof generateSettlementV1>[0]) => {
      const result = generateSettlementV1(input);
      if (result.settlement) {
        setSettlements((prev) => [result.settlement, ...prev]);
      }
      return result;
    },
    [generateSettlementV1],
  );

  const recalculateWrapped = useCallback(
    (
      settlementId: string,
      input: Parameters<typeof recalculateSettlement>[1],
    ) => {
      const result = recalculateSettlement(settlementId, input);
      if (result.settlement) {
        setSettlements((prev) =>
          prev.map((s) => (s.id === settlementId ? result.settlement! : s)),
        );
      }
      return result;
    },
    [recalculateSettlement],
  );

  const sendSettlementToReview = useCallback((settlementId: string) => {
    setSettlements((prev) =>
      prev.map((s) =>
        s.id === settlementId &&
        s.status !== "approved" &&
        s.status !== "paid" &&
        s.status !== "voided"
          ? { ...s, status: "needs_review" as const }
          : s,
      ),
    );
  }, []);

  const approveWrapped = useCallback(
    (settlementId: string, reviewCtx: SettlementReviewContext) => {
      const result = approveSettlement(settlementId, reviewCtx);
      if (result.settlement) {
        setSettlements((prev) =>
          prev.map((s) => (s.id === settlementId ? result.settlement! : s)),
        );
      }
      return result;
    },
    [approveSettlement],
  );

  const recordPayoutWrapped = useCallback(
    (settlementId: string, input: Parameters<typeof recordPayout>[1]) => {
      const result = recordPayout(settlementId, input);
      if (result.settlement) {
        setSettlements((prev) =>
          prev.map((s) => (s.id === settlementId ? result.settlement! : s)),
        );
      }
      return result;
    },
    [recordPayout],
  );

  const reopenWrapped = useCallback(
    (settlementId: string, reason: string) => {
      const result = reopenSettlement(settlementId, reason);
      if (result.settlement) {
        setSettlements((prev) =>
          prev.map((s) => (s.id === settlementId ? result.settlement! : s)),
        );
      }
      return result;
    },
    [reopenSettlement],
  );

  const voidWrapped = useCallback(
    (settlementId: string, reason: string) => {
      const result = voidSettlement(settlementId, reason);
      if (result.settlement) {
        setSettlements((prev) =>
          prev.map((s) => (s.id === settlementId ? result.settlement! : s)),
        );
      }
      return result;
    },
    [voidSettlement],
  );

  const value = useMemo<InvestorWorkspaceStore>(
    () => ({
      agreements,
      settlements,
      partnerMeta,
      timeline,
      upsertPartnerMeta,
      setPartnerStatus,
      createAgreement: createAgreementWrapped,
      changeAgreementTerms: changeAgreementTermsWrapped,
      endAgreement,
      generateSettlementV1: generateSettlementWrapped,
      recalculateSettlement: recalculateWrapped,
      sendSettlementToReview,
      approveSettlement: approveWrapped,
      recordPayout: recordPayoutWrapped,
      reopenSettlement: reopenWrapped,
      voidSettlement: voidWrapped,
      nextSettlementNumber,
      logTimelineEvent,
      timelineForInvestor,
    }),
    [
      agreements,
      settlements,
      partnerMeta,
      timeline,
      upsertPartnerMeta,
      setPartnerStatus,
      createAgreementWrapped,
      changeAgreementTermsWrapped,
      endAgreement,
      generateSettlementWrapped,
      recalculateWrapped,
      sendSettlementToReview,
      approveWrapped,
      recordPayoutWrapped,
      reopenWrapped,
      voidWrapped,
      nextSettlementNumber,
      logTimelineEvent,
      timelineForInvestor,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useInvestorWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx)
    throw new Error(
      "useInvestorWorkspace must be used within InvestorWorkspaceProvider",
    );
  return ctx;
}
