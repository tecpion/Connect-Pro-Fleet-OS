// Connect Pro Fleet — Build #22 auth + backend mode tests.
// Run in memory mode (no network). Verifies AuthProvider session handling,
// protected routing, sign-in/sign-out, and config-error behavior.

import { describe, it, expect, beforeEach } from "vitest";
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

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={["/protected"]}>
      <AuthProvider>
        <StoreProvider>{children}</StoreProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("Build #22 backend mode", () => {
  it("defaults to memory mode without config", () => {
    expect(getBackendMode()).toBe("memory");
  });

  it("hasSupabaseConfig is false in test env", () => {
    expect(hasSupabaseConfig()).toBe(false);
  });

  it("requireSupabaseConfig returns null in memory mode", () => {
    expect(requireSupabaseConfig()).toBeNull();
  });
});

describe("Build #22 AuthProvider (memory mode)", () => {
  beforeEach(() => {
    // Ensure memory mode.
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
