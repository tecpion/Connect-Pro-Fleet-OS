// Connect Pro Fleet — useStore hook (Build #5).

import { useContext } from "react";
import { StoreContext } from "./storeContext";

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
