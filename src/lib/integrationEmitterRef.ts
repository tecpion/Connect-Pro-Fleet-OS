// Connect Pro Fleet — integration emitter injection (Build #21).
//
// The main store is built inside StoreProvider BEFORE IntegrationProvider
// mounts (StoreProvider is the outermost provider). To let domain store
// methods emit outbound sync events without importing the React context, we
// use a module-level mutable emitter ref that IntegrationProvider populates
// on mount and clears on unmount.
//
// This keeps the store's public API stable (no new props threaded through
// every build* method) while giving domain actions a single emission path.
// If no integration is mounted, the emitter is the NULL_EMITTER (safe no-op),
// so financial actions never fail because of sync state.

import type { IntegrationEmitter } from "./integrationEmit";
import { NULL_EMITTER } from "./integrationEmit";

let currentEmitter: IntegrationEmitter = NULL_EMITTER;

/** Called by IntegrationProvider on mount/Update with the live emitter. */
export function setIntegrationEmitter(emitter: IntegrationEmitter) {
  currentEmitter = emitter;
}

/** Called by IntegrationProvider on unmount to restore the no-op emitter. */
export function clearIntegrationEmitter() {
  currentEmitter = NULL_EMITTER;
}

/** Read by domain store methods to emit outbound events. Always returns a
 *  valid emitter (never null) — the no-op emitter when integration is absent. */
export function getIntegrationEmitter(): IntegrationEmitter {
  return currentEmitter;
}
