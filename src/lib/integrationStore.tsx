// Connect Pro Fleet — Connect Pro ↔ Fleet sync provider (Build #21).
//
// Standalone context (mirrors billingStore / investorStore pattern) composing
// the config, external-id registry, outbox, inbox, and review queue. Consumes
// the main store's authoritative ledger methods so inbound payments post
// through the SAME postPayment path as manual Fleet payments — no parallel
// payment engine. All records are tenant-scoped and RLS-ready.

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useStore } from "./store";
import type {
  ConnectProIntegrationConfig,
  ExternalEntityReference,
  IntegrationEvent,
  IntegrationReviewItem,
  PaymentAck,
  ReviewResolution,
} from "./integrationTypes";
import { MockConnectProTransport } from "./integrationTransport";
import {
  buildRegistryMethods,
  type RegistryMethods,
} from "./integrationRegistry";
import { buildOutboxMethods, type OutboxMethods } from "./integrationOutbox";
import { buildInboxMethods } from "./integrationInbox";
import { buildReviewMethods } from "./integrationReview";
import { normalizeProcessor } from "./paymentMethodTypes";
import {
  setIntegrationEmitter,
  clearIntegrationEmitter,
} from "./integrationEmitterRef";
import { useEffect } from "react";

export interface IntegrationContextValue {
  config: ConnectProIntegrationConfig;
  externalRefs: ExternalEntityReference[];
  events: IntegrationEvent[];
  reviewItems: IntegrationReviewItem[];

  enableIntegration: () => void;
  disableIntegration: () => void;
  testConnection: () => void;
  setConfig: (patch: Partial<ConnectProIntegrationConfig>) => void;

  mapExternalId: RegistryMethods["mapExternalId"];
  resolveInternalId: RegistryMethods["resolveInternalId"];
  resolveExternalId: RegistryMethods["resolveExternalId"];
  refsForEntity: RegistryMethods["refsForEntity"];

  enqueueOutbound: OutboxMethods["enqueueOutbound"];
  retryEvent: OutboxMethods["retryEvent"];
  flushOutbox: OutboxMethods["flushOutbox"];

  processInboundPayment: (input: {
    external_event_id: string;
    external_payment_id?: string | null;
    customer_external_id?: string | null;
    rental_external_id?: string | null;
    billing_period_external_id?: string | null;
    invoice_external_id?: string | null;
    amount: number;
    tender_method: string;
    processor?: string | null;
    payment_source?: string;
    paid_at?: string;
    reference?: string | null;
    external_transaction_id?: string | null;
    notes?: string | null;
  }) => PaymentAck;
  processInboundReversal: (input: {
    external_event_id: string;
    external_payment_id: string;
    amount: number;
    reason?: string | null;
  }) => PaymentAck;
  resolveReview: (
    reviewId: string,
    resolution: ReviewResolution,
    input?: {
      rentalId?: string;
      customerId?: string;
      billingPeriodId?: string | null;
      reason?: string;
    },
  ) => PaymentAck | { ok: boolean; message: string };
  ignoreReview: (reviewId: string, reason: string) => void;

  pendingEvents: () => IntegrationEvent[];
  failedEvents: () => IntegrationEvent[];
  deadLetterEvents: () => IntegrationEvent[];
  openReviews: () => IntegrationReviewItem[];
  syncHealth: () => {
    pending: number;
    failed: number;
    deadLetter: number;
    openReviews: number;
    lastSync: string | null;
  };

  _transport: MockConnectProTransport;
}

const IntegrationContext = createContext<IntegrationContextValue | null>(null);

function defaultConfig(): ConnectProIntegrationConfig {
  const now = new Date().toISOString();
  return {
    tenant_id: "tenant_demo",
    enabled: false,
    connection_status: "not_connected",
    external_location_id: null,
    default_sync_enabled: true,
    payment_sync_enabled: true,
    billing_event_sync_enabled: true,
    customer_sync_enabled: true,
    webhook_secret_status: "missing",
    last_successful_sync_at: null,
    last_error_at: null,
    last_error_message: null,
    created_at: now,
    updated_at: now,
  };
}

export function IntegrationProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const [config, setConfigState] =
    useState<ConnectProIntegrationConfig>(defaultConfig);
  // Ref mirror of config.enabled so the outbox's isEnabled() reads the latest
  // value synchronously (the state value is stale until React flushes).
  const enabledRef = useRef(config.enabled);
  const [externalRefs, setExternalRefs] = useState<ExternalEntityReference[]>(
    [],
  );
  const [events, setEvents] = useState<IntegrationEvent[]>([]);
  const [reviewItems, setReviewItems] = useState<IntegrationReviewItem[]>([]);

  // Ref mirrors of state so rapid sequential calls within one batched act()
  // read authoritative latest values (the useState values are stale until
  // React flushes). Kept in sync via the setters below.
  const externalRefsRef = useRef<ExternalEntityReference[]>(externalRefs);
  const eventsRef = useRef<IntegrationEvent[]>(events);
  const reviewItemsRef = useRef<IntegrationReviewItem[]>(reviewItems);
  const setExternalRefsSynced = (
    updater: React.SetStateAction<ExternalEntityReference[]>,
  ) => {
    const prev = externalRefsRef.current;
    const next =
      typeof updater === "function"
        ? (
            updater as (
              p: ExternalEntityReference[],
            ) => ExternalEntityReference[]
          )(prev)
        : updater;
    externalRefsRef.current = next;
    setExternalRefs(next);
  };
  const setEventsSynced = (
    updater: React.SetStateAction<IntegrationEvent[]>,
  ) => {
    // Compute next from the REF (authoritative latest), not the stale `prev`
    // state, so rapid sequential calls within one batched act() accumulate
    // correctly (e.g. retry attempts incrementing).
    const prev = eventsRef.current;
    const next =
      typeof updater === "function"
        ? (updater as (p: IntegrationEvent[]) => IntegrationEvent[])(prev)
        : updater;
    eventsRef.current = next;
    setEvents(next);
  };
  const setReviewItemsSynced = (
    updater: React.SetStateAction<IntegrationReviewItem[]>,
  ) => {
    const prev = reviewItemsRef.current;
    const next =
      typeof updater === "function"
        ? (updater as (p: IntegrationReviewItem[]) => IntegrationReviewItem[])(
            prev,
          )
        : updater;
    reviewItemsRef.current = next;
    setReviewItems(next);
  };

  const processedEventKeys = useRef<Set<string>>(new Set());
  const processedExternalPaymentIds = useRef<Set<string>>(new Set());
  const processedExternalTxnIds = useRef<Set<string>>(new Set());
  const postedPaymentByExternalId = useRef<
    Map<string, import("./integrationConflict").PostedPaymentRef>
  >(new Map());
  const transportRef = useRef<MockConnectProTransport | null>(null);
  if (transportRef.current === null) {
    transportRef.current = new MockConnectProTransport();
  }
  const transport = transportRef.current;

  const value = useMemo<IntegrationContextValue>(() => {
    const now = () => new Date().toISOString();

    function setConfig(patch: Partial<ConnectProIntegrationConfig>) {
      setConfigState((c) => {
        const next = { ...c, ...patch, updated_at: now() };
        enabledRef.current = next.enabled;
        return next;
      });
    }
    function testConnection() {
      const r = transport.testConnection();
      setConfig({
        connection_status: r.ok ? "connected" : "error",
        last_successful_sync_at: r.ok ? now() : null,
        last_error_at: r.ok ? null : now(),
        last_error_message: r.ok ? null : r.message,
      });
    }

    const registry = buildRegistryMethods({
      getExternalRefs: () => externalRefsRef.current,
      setExternalRefs: setExternalRefsSynced,
    });
    const outbox = buildOutboxMethods(
      {
        events: () => eventsRef.current,
        setEvents: setEventsSynced,
        processedEventKeys,
      },
      {
        transport,
        isEnabled: () => enabledRef.current,
        setLastSync: (ts) =>
          setConfigState((c) => ({
            ...c,
            last_successful_sync_at: ts,
            last_error_at: null,
            last_error_message: null,
          })),
        setLastError: (ts, message) =>
          setConfigState((c) => ({
            ...c,
            last_error_at: ts,
            last_error_message: message,
          })),
      },
    );

    function enableIntegration() {
      setConfig({
        enabled: true,
        connection_status: "connected",
        webhook_secret_status: "configured",
        last_successful_sync_at: now(),
      });
      // Set the emitter ref SYNCHRONOUSLY so domain actions in the same
      // batched act() emit immediately (useEffect would run too late).
      setIntegrationEmitter({
        enabled: true,
        enqueueOutbound: outbox.enqueueOutbound,
      });
    }
    function disableIntegration() {
      setConfig({ enabled: false, connection_status: "not_connected" });
      setIntegrationEmitter({
        enabled: false,
        enqueueOutbound: outbox.enqueueOutbound,
      });
    }

    const inbox = buildInboxMethods(
      {
        events: () => eventsRef.current,
        setEvents: setEventsSynced,
        reviewItems: () => reviewItemsRef.current,
        setReviewItems: setReviewItemsSynced,
        processedEventKeys,
        processedExternalPaymentIds,
        processedExternalTxnIds,
        postedPaymentByExternalId,
        externalRefs: () => externalRefsRef.current,
      },
      { store, registry, outbox },
    );
    const review = buildReviewMethods(
      {
        events: () => eventsRef.current,
        reviewItems: () => reviewItemsRef.current,
        setReviewItems: setReviewItemsSynced,
        processedExternalPaymentIds,
        processedExternalTxnIds,
      },
      { store, outbox, markInboundProcessed: inbox.markInboundProcessed },
    );

    const pendingEvents = () => events.filter((e) => e.status === "pending");
    const failedEvents = () => events.filter((e) => e.status === "failed");
    const deadLetterEvents = () =>
      events.filter((e) => e.status === "dead_letter");
    const openReviews = () => reviewItems.filter((r) => r.status === "open");
    const syncHealth = () => ({
      pending: pendingEvents().length,
      failed: failedEvents().length,
      deadLetter: deadLetterEvents().length,
      openReviews: openReviews().length,
      lastSync: config.last_successful_sync_at,
    });

    return {
      config,
      externalRefs,
      events,
      reviewItems,
      enableIntegration,
      disableIntegration,
      testConnection,
      setConfig,
      mapExternalId: registry.mapExternalId,
      resolveInternalId: registry.resolveInternalId,
      resolveExternalId: registry.resolveExternalId,
      refsForEntity: registry.refsForEntity,
      enqueueOutbound: outbox.enqueueOutbound,
      retryEvent: outbox.retryEvent,
      flushOutbox: outbox.flushOutbox,
      processInboundPayment: (input) =>
        inbox.processInboundPayment({
          ...input,
          processor: normalizeProcessor(input.processor),
        }),
      processInboundReversal: inbox.processInboundReversal,
      resolveReview: review.resolveReview,
      ignoreReview: review.ignoreReview,
      pendingEvents,
      failedEvents,
      deadLetterEvents,
      openReviews,
      syncHealth,
      _transport: transport,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, externalRefs, events, reviewItems, store]);

  // Populate the module-level emitter ref so domain store methods can emit
  // outbound events without importing the React context. Cleared on unmount.
  useEffect(() => {
    setIntegrationEmitter({
      enabled: config.enabled,
      enqueueOutbound: value.enqueueOutbound,
    });
    return () => clearIntegrationEmitter();
  }, [config.enabled, value]);

  return (
    <IntegrationContext.Provider value={value}>
      {children}
    </IntegrationContext.Provider>
  );
}

export function useIntegration(): IntegrationContextValue {
  const ctx = useContext(IntegrationContext);
  if (!ctx)
    throw new Error("useIntegration must be used within IntegrationProvider");
  return ctx;
}
