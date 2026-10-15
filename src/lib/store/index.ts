// Connect Pro Fleet — store barrel (Build #5).
//
// Public API preserved exactly: `useStore`, `StoreProvider`, `uid`, `TENANT_ID`
// are re-exported here so the ~50 files importing from "@/lib/store" keep
// working unchanged. The implementation now lives in focused domain modules
// under src/lib/store/.

export { StoreProvider } from "./StoreProvider";
export { useStore } from "./useStore";
export { uid, TENANT_ID } from "./ids";
export type {
  FleetStore,
  ActivityEntry,
  RentalVehicleExchange,
} from "./storeContext";
