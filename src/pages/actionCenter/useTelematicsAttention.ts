import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useTelematicsOptional } from "@/lib/store/telematicsStore";
import { selectTelematicsAttention } from "@/lib/telematicsSelectors";

/**
 * V1 Telematics Hub — high/medium telematics alerts surfaced in the Action
 * Center. Deep-links into Telematics → Alerts. NOT a second task queue.
 * Returns [] when the optional telematics store is absent.
 */
export function useTelematicsAttention() {
  const store = useStore();
  const teleOpt = useTelematicsOptional();
  return useMemo(
    () =>
      teleOpt
        ? selectTelematicsAttention(store, {
            devices: teleOpt.devices,
            positions: teleOpt.positions,
            trips: teleOpt.trips,
            alerts: teleOpt.alerts,
            geofences: teleOpt.geofences,
            assignmentHistory: teleOpt.assignmentHistory,
            adapters: teleOpt.adapters,
          })
        : [],
    [teleOpt, store],
  );
}
