// Connect Pro Fleet — shared store ids + uid (Build #5).

export const TENANT_ID = "tnt_connectpro";

export const uid = (p: string) =>
  `${p}_${Math.random().toString(36).slice(2, 8)}`;
