// Connect Pro Fleet — activity log methods (Build #5).

import type { StoreState } from "./storeState";
import type { ActivityEntry } from "./storeContext";

export function buildActivityMethods(s: StoreState) {
  return {
    logActivity: (e: ActivityEntry) =>
      s.setActivity((a) => [e, ...a].slice(0, 30)),
  };
}
