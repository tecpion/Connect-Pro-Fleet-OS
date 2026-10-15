// Connect Pro Fleet — agent config + entitlement state hook (Build #46).
//
// Owns the AgentConfig[] + AgentEntitlement state and the mutation methods
// that wrap them with audit logging. Extracted from the provider to keep
// each module focused. Agents are opt-in (default disabled); entitlements
// carry the plan/allowance/overage/cap configuration.

import { useCallback, useState } from "react";
import type {
  AgentAuditEntry,
  AgentConfig,
  AgentEnableState,
  AgentEntitlement,
  AgentId,
  AgentMode,
} from "./agentTypes";
import { ALL_AGENT_TYPES, getAgentDefinition } from "./agentRegistry";
import { DEFAULT_AI_ENTITLEMENT } from "./agentEntitlements";
import { TENANT_ID, uid } from "./store/ids";

const nowIso = () => new Date().toISOString();

export function defaultConfigs(): AgentConfig[] {
  return ALL_AGENT_TYPES.map((id) => ({
    agent_id: id,
    enable_state: "disabled" as AgentEnableState,
    max_mode: getAgentDefinition(id).default_mode,
    location_ids: [],
    auto_create_internal_tasks: false,
    preferences: {},
    enabled_at: null,
    paused_at: null,
    disabled_at: null,
  }));
}

export interface AgentConfigState {
  configs: AgentConfig[];
  entitlement: AgentEntitlement;
  getConfig: (agentId: AgentId) => AgentConfig;
  setAgentEnableState: (agentId: AgentId, state: AgentEnableState) => void;
  setAgentMaxMode: (agentId: AgentId, mode: AgentMode) => void;
  setAgentLocations: (agentId: AgentId, locationIds: string[]) => void;
  setAutoCreateInternalTasks: (agentId: AgentId, enabled: boolean) => void;
  setAgentPreference: (agentId: AgentId, key: string, value: unknown) => void;
  updateEntitlement: (patch: Partial<AgentEntitlement>) => void;
  setMonthlySpendingCap: (cap: number | null) => void;
  setOverageEnabled: (enabled: boolean) => void;
}

export function useAgentConfigState(
  logAudit: (entry: Omit<AgentAuditEntry, "id" | "tenant_id" | "at">) => void,
  currentStaffId: string,
): AgentConfigState {
  const [configs, setConfigs] = useState<AgentConfig[]>(defaultConfigs);
  const [entitlement, setEntitlement] = useState<AgentEntitlement>(
    DEFAULT_AI_ENTITLEMENT,
  );

  const getConfig = useCallback(
    (agentId: AgentId): AgentConfig =>
      configs.find((c) => c.agent_id === agentId) ?? {
        agent_id: agentId,
        enable_state: "disabled",
        max_mode: getAgentDefinition(agentId).default_mode,
        location_ids: [],
        auto_create_internal_tasks: false,
        preferences: {},
        enabled_at: null,
        paused_at: null,
        disabled_at: null,
      },
    [configs],
  );

  const setAgentEnableState = useCallback(
    (agentId: AgentId, state: AgentEnableState) => {
      setConfigs((prev) =>
        prev.map((c) =>
          c.agent_id === agentId
            ? {
                ...c,
                enable_state: state,
                enabled_at: state === "enabled" ? nowIso() : c.enabled_at,
                paused_at: state === "paused" ? nowIso() : c.paused_at,
                disabled_at: state === "disabled" ? nowIso() : c.disabled_at,
              }
            : c,
        ),
      );
      logAudit({
        event:
          state === "enabled"
            ? "agent_enabled"
            : state === "paused"
              ? "agent_paused"
              : "agent_disabled",
        agent_id: agentId,
        actor_staff_id: currentStaffId,
        detail: `Agent ${agentId} ${state}`,
      });
    },
    [logAudit, currentStaffId],
  );

  const setAgentMaxMode = useCallback((agentId: AgentId, mode: AgentMode) => {
    setConfigs((prev) =>
      prev.map((c) => (c.agent_id === agentId ? { ...c, max_mode: mode } : c)),
    );
  }, []);

  const setAgentLocations = useCallback(
    (agentId: AgentId, locationIds: string[]) => {
      setConfigs((prev) =>
        prev.map((c) =>
          c.agent_id === agentId ? { ...c, location_ids: locationIds } : c,
        ),
      );
      logAudit({
        event: "settings_changed",
        agent_id: agentId,
        actor_staff_id: currentStaffId,
        detail: `Location scope set to ${locationIds.length ? locationIds.join(",") : "all"}`,
      });
    },
    [logAudit, currentStaffId],
  );

  const setAutoCreateInternalTasks = useCallback(
    (agentId: AgentId, enabled: boolean) => {
      setConfigs((prev) =>
        prev.map((c) =>
          c.agent_id === agentId
            ? { ...c, auto_create_internal_tasks: enabled }
            : c,
        ),
      );
      logAudit({
        event: "settings_changed",
        agent_id: agentId,
        actor_staff_id: currentStaffId,
        detail: `Auto-create internal tasks ${enabled ? "on" : "off"}`,
      });
    },
    [logAudit, currentStaffId],
  );

  const setAgentPreference = useCallback(
    (agentId: AgentId, key: string, value: unknown) => {
      setConfigs((prev) =>
        prev.map((c) =>
          c.agent_id === agentId
            ? { ...c, preferences: { ...c.preferences, [key]: value } }
            : c,
        ),
      );
    },
    [],
  );

  const updateEntitlement = useCallback(
    (patch: Partial<AgentEntitlement>) => {
      setEntitlement((prev) => ({ ...prev, ...patch }));
      logAudit({
        event: "settings_changed",
        agent_id: null,
        actor_staff_id: currentStaffId,
        detail: `Entitlement updated: ${Object.keys(patch).join(", ")}`,
      });
    },
    [logAudit, currentStaffId],
  );

  const setMonthlySpendingCap = useCallback(
    (cap: number | null) => {
      setEntitlement((prev) => ({ ...prev, spending_cap: cap ?? 0 }));
      logAudit({
        event: "spending_cap_changed",
        agent_id: null,
        actor_staff_id: currentStaffId,
        detail: `Monthly spending cap set to ${cap ?? 0}`,
      });
    },
    [logAudit, currentStaffId],
  );

  const setOverageEnabled = useCallback(
    (enabled: boolean) => {
      setEntitlement((prev) => ({ ...prev, overage_enabled: enabled }));
      logAudit({
        event: enabled ? "overage_enabled" : "overage_disabled",
        agent_id: null,
        actor_staff_id: currentStaffId,
        detail: `Overage ${enabled ? "enabled" : "disabled"}`,
      });
    },
    [logAudit, currentStaffId],
  );

  return {
    configs,
    entitlement,
    getConfig,
    setAgentEnableState,
    setAgentMaxMode,
    setAgentLocations,
    setAutoCreateInternalTasks,
    setAgentPreference,
    updateEntitlement,
    setMonthlySpendingCap,
    setOverageEnabled,
  };
}

/** Stable id + timestamp helper for audit entries. */
export function makeAuditEntry(
  entry: Omit<AgentAuditEntry, "id" | "tenant_id" | "at">,
): AgentAuditEntry {
  return {
    id: uid("audit"),
    tenant_id: TENANT_ID,
    at: nowIso(),
    ...entry,
  };
}
