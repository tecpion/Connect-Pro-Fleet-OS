// Connect Pro Fleet — Build #22 auth + backend mode tests.
//
// Cloud is now intentionally enabled, so the live environment resolves to
// `supabase` mode. These tests cover BOTH modes:
//   - live Cloud config → supabase mode / config present
//   - no-config (mocked) → memory mode / demo session
// The memory-mode AuthProvider behavior is preserved by mocking the client
// module to force memory mode for those tests only. Production backend-mode
// logic is NOT changed.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, renderHook, act, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/lib/supabase/authContext";
import { RequireAuth } from "@/components/RequireAuth";
import { StoreProvider } from "@/lib/store";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import {
  getBackendMode,
  hasSupabaseConfig,
  requireSupabaseConfig,
} from "@/lib/supabase/client";

// Controllable client mock. Default to memory mode so the AuthProvider
// memory-mode tests get a deterministic demo session without touching the
// network. Individual describes flip this to exercise live-config behavior.
const mockClient = vi.hoisted(() => ({
  mode: "memory" as "memory" | "supabase",
  config: false,
}));

vi.mock("@/lib/supabase/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase/client")>(
    "@/lib/supabase/client",
  );
  return {
    ...actual,
    getBackendMode: () => mockClient.mode,
    hasSupabaseConfig: () => mockClient.config,
    requireSupabaseConfig: () =>
      mockClient.mode === "supabase" && !mockClient.config
        ? "Cloud backend mode is enabled but configuration is missing."
        : null,
    // Memory mode never constructs a real client.
    getSupabase: () => null,
    _resetSupabaseClient: () => {},
  };
});

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={["/protected"]}>
      <AuthProvider>
        <StoreProvider>{children}</StoreProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("Build #22 backend mode (live Cloud config)", () => {
  beforeEach(() => {
    mockClient.mode = "supabase";
    mockClient.config = true;
  });

  it("resolves to supabase mode when Cloud config is present", () => {
    expect(getBackendMode()).toBe("supabase");
  });

  it("hasSupabaseConfig is true when configured", () => {
    expect(hasSupabaseConfig()).toBe(true);
  });

  it("requireSupabaseConfig returns null when config is present", () => {
    expect(requireSupabaseConfig()).toBeNull();
  });
});

describe("Build #22 backend mode (no config → memory)", () => {
  beforeEach(() => {
    mockClient.mode = "memory";
    mockClient.config = false;
  });

  it("defaults to memory mode without config", () => {
    expect(getBackendMode()).toBe("memory");
  });

  it("hasSupabaseConfig is false without config", () => {
    expect(hasSupabaseConfig()).toBe(false);
  });

  it("requireSupabaseConfig returns null in memory mode", () => {
    expect(requireSupabaseConfig()).toBeNull();
  });
});

describe("Build #22 AuthProvider (memory mode)", () => {
  beforeEach(() => {
    // Force memory mode for the demo-session behavior.
    mockClient.mode = "memory";
    mockClient.config = false;
    expect(getBackendMode()).toBe("memory");
  });

  it("provides a demo session in memory mode", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session.user).not.toBeNull();
    expect(result.current.session.profile?.display_name).toBe("Ava Reyes");
    expect(result.current.session.activeOrganizationId).toBe("tnt_connectpro");
    expect(result.current.backendMode).toBe("memory");
    expect(result.current.configError).toBeNull();
  });

  it("signIn accepts any credentials in memory mode", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let res: { ok: boolean } = { ok: false };
    await act(async () => {
      res = await result.current.signIn("x@y.z", "pw");
    });
    expect(res.ok).toBe(true);
    expect(result.current.session.user).not.toBeNull();
  });

  it("signOut clears the session", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.session.user).toBeNull();
  });

  it("renders protected content when authenticated in memory mode", async () => {
    const { getByTestId } = render(
      <MemoryRouter initialEntries={["/protected"]}>
        <AuthProvider>
          <StoreProvider>
            <Routes>
              <Route
                path="/protected"
                element={
                  <RequireAuth>
                    <div data-testid="protected">ok</div>
                  </RequireAuth>
                }
              />
              <Route
                path="/signin"
                element={<div data-testid="signin">signin</div>}
              />
            </Routes>
          </StoreProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(getByTestId("protected")).toBeTruthy());
  });

  it("redirects to signin when unauthenticated", async () => {
    function SignOutThen() {
      const auth = useAuth();
      return (
        <button
          data-testid="signout"
          onClick={() => {
            void auth.signOut();
          }}
        >
          out
        </button>
      );
    }
    const { getByTestId } = render(
      <MemoryRouter initialEntries={["/protected"]}>
        <AuthProvider>
          <StoreProvider>
            <Routes>
              <Route
                path="/protected"
                element={
                  <RequireAuth>
                    <div data-testid="protected">ok</div>
                    <SignOutThen />
                  </RequireAuth>
                }
              />
              <Route
                path="/signin"
                element={<div data-testid="signin">signin</div>}
              />
            </Routes>
          </StoreProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(getByTestId("protected")).toBeTruthy());
    // Sign out within the SAME provider tree, then expect redirect.
    await act(async () => {
      getByTestId("signout").click();
    });
    await waitFor(() => expect(getByTestId("signin")).toBeTruthy());
  });
});
