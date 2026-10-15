// Connect Pro Fleet — mock sync transport (Build #21).

import type {
  DeliveryResult,
  IntegrationEvent,
  IntegrationTransport,
} from "./integrationTypes";

/** Mock transport — records outbound payloads, configurable success/failure.
 *  No real credentials. Used by tests to simulate delivery + retries. */
export class MockConnectProTransport implements IntegrationTransport {
  sent: IntegrationEvent[] = [];
  failNext = 0;

  sendEvent(event: IntegrationEvent): DeliveryResult {
    this.sent.push(event);
    if (this.failNext > 0) {
      this.failNext -= 1;
      return {
        ok: false,
        reason: "Simulated delivery failure",
        retryable: true,
        failure_type: "transient_delivery",
      };
    }
    return { ok: true, provider_message_id: `mock_${event.id}` };
  }

  testConnection(): { ok: boolean; message: string } {
    return { ok: true, message: "Mock transport connected" };
  }

  /** Test helper: cause the next N send attempts to fail. */
  simulateFailure(count: number) {
    this.failNext = count;
  }

  get sentEvents() {
    return this.sent;
  }

  reset() {
    this.sent = [];
    this.failNext = 0;
  }
}
