/**
 * Temporary router-compat shim — bridges react-router v6 call sites to
 * @tanstack/react-router while components are translated incrementally.
 *
 * In the migrated app (TanStack Start) a TanStack router context is always
 * present, so the hooks delegate to TanStack. In the restored Vitest suite the
 * test harness mounts components inside react-router-dom's `MemoryRouter`
 * (no TanStack context); there the hooks fall back to react-router-dom so the
 * frozen V1 assertions render without a TanStack router. Remove this shim
 * after every caller uses native TanStack Router APIs.
 */
import {
  useNavigate as tsNavigate,
  useLocation as tsLocation,
  useParams as tsParams,
  useSearch as tsSearch,
  useRouter,
  Link as TSLink,
  Navigate as TSNavigate,
  Outlet as TSOutlet,
} from "@tanstack/react-router";
import {
  useMemo,
  useCallback,
  forwardRef,
  type ComponentProps,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ReactNode,
} from "react";

// ---------- shared URL parsing ----------

function parseTo(to: string): {
  pathname: string;
  search?: Record<string, string>;
  hash?: string;
} {
  const [beforeHash, hashStr] = (to ?? "").split("#");
  const [pathname, searchStr] = beforeHash.split("?");
  return {
    // react-router keeps the current path for search-only ("?a=1") and
    // hash-only ("#section") targets; TanStack's "." means current route.
    pathname: pathname || ".",
    search: searchStr
      ? Object.fromEntries(new URLSearchParams(searchStr))
      : undefined,
    hash: hashStr || undefined,
  };
}

// ---------- TanStack context detection ----------
//
// TanStack's useRouter() throws when no router context is present (the Vitest
// harness wraps components in react-router-dom's MemoryRouter, not a TanStack
// router). Detect that and fall back to react-router-dom equivalents so the
// frozen V1 tests render unchanged.

function hasTanStackRouter(): boolean {
  try {
    useRouter();
    return true;
  } catch {
    return false;
  }
}

// Lazily resolve react-router-dom hooks. The dependency is installed (dev) so
// the restored suite can mount components in MemoryRouter; in production the
// app never imports react-router-dom and tree-shaking drops this branch.
async function rrDom() {
  return await import("react-router-dom");
}

// ---------- useNavigate ----------

type NavigateOptions = { replace?: boolean; state?: unknown };

type NavigateFn = {
  (to: string | number, options?: NavigateOptions): void;
  (delta: number): void;
};

export function useNavigate(): NavigateFn {
  if (!hasTanStackRouter()) {
    // Fall back to react-router-dom (test harness). Resolved synchronously via
    // a captured hook reference on first render.
    return useRrNavigate();
  }
  const tsNav = tsNavigate();
  const router = useRouter();
  return useCallback(
    (to: string | number, options?: NavigateOptions) => {
      if (typeof to === "number") {
        router.history.go(to);
        return;
      }
      const { pathname, search, hash } = parseTo(to);
      tsNav({
        to: pathname,
        search: search as never,
        hash,
        state: options?.state as never,
        replace: options?.replace,
      });
    },
    [tsNav, router],
  ) as NavigateFn;
}

// react-router-dom navigate fallback (used only in tests).
function useRrNavigate(): NavigateFn {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("react-router-dom") as typeof import("react-router-dom");
  const nav = mod.useNavigate();
  return useCallback(
    (to: string | number, options?: NavigateOptions) => {
      if (typeof to === "number") {
        nav(to);
        return;
      }
      nav({ pathname: to, replace: options?.replace });
    },
    [nav],
  ) as NavigateFn;
}

// ---------- useLocation ----------

export function useLocation() {
  if (!hasTanStackRouter()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-router-dom") as typeof import("react-router-dom");
    const loc = mod.useLocation();
    return useMemo(
      () => ({
        pathname: loc.pathname,
        search: loc.search,
        hash: loc.hash,
        state: loc.state ?? null,
        key: loc.key ?? loc.pathname,
      }),
      [loc.pathname, loc.search, loc.hash, loc.state, loc.key],
    );
  }
  const loc = tsLocation();
  return useMemo(
    () => ({
      pathname: loc.pathname,
      search: loc.searchStr ? `?${loc.searchStr}` : "",
      hash: loc.hash ?? "",
      state: (loc.state ?? null) as unknown,
      key: loc.pathname + (loc.searchStr ?? ""),
    }),
    [loc.pathname, loc.searchStr, loc.hash, loc.state],
  );
}

// ---------- useParams ----------

export function useParams<
  T extends Record<string, string | undefined> = Record<
    string,
    string | undefined
  >,
>(): T {
  if (!hasTanStackRouter()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-router-dom") as typeof import("react-router-dom");
    return mod.useParams() as T;
  }
  return tsParams({ strict: false } as never) as T;
}

// ---------- useSearchParams (@/lib/router-compat compat) ----------

export function useSearchParams(): [
  URLSearchParams,
  (
    init:
      | URLSearchParams
      | Record<string, string>
      | ((prev: URLSearchParams) => URLSearchParams),
    opts?: { replace?: boolean },
  ) => void,
] {
  if (!hasTanStackRouter()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-router-dom") as typeof import("react-router-dom");
    const [params, setParams] = mod.useSearchParams();
    return [params, setParams as never];
  }
  const loc = tsLocation();
  const nav = tsNavigate();
  const router = useRouter();
  const params = useMemo(
    () => new URLSearchParams(loc.searchStr ?? ""),
    [loc.searchStr],
  );
  const setParams = useCallback(
    (
      init:
        | URLSearchParams
        | Record<string, string>
        | ((prev: URLSearchParams) => URLSearchParams),
      opts?: { replace?: boolean },
    ) => {
      // Functional updaters read the router's live location, not the render
      // snapshot — react-router passes call-time params, and chained updates
      // within one tick must see each other's writes.
      const live = router.state.location;
      const current = new URLSearchParams(live.searchStr ?? "");
      const next =
        typeof init === "function"
          ? init(current)
          : init instanceof URLSearchParams
            ? init
            : new URLSearchParams(init);
      const searchObj: Record<string, string> = {};
      next.forEach((v, k) => {
        searchObj[k] = v;
      });
      nav({
        to: live.pathname,
        search: searchObj as never,
        replace: opts?.replace,
      });
    },
    [nav, router],
  );
  return [params, setParams];
}

// ---------- Link ----------

type LinkProps = Omit<ComponentProps<typeof TSLink>, "to"> & {
  to: string;
  replace?: boolean;
  state?: unknown;
  children?: ReactNode;
};

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { to, replace, state, children, ...rest },
  ref,
) {
  if (!hasTanStackRouter()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-router-dom") as typeof import("react-router-dom");
    const RrLink = mod.Link;
    return (
      <RrLink ref={ref as never} to={to} replace={replace} state={state as never}>
        {children}
      </RrLink>
    );
  }
  const { pathname, search, hash } = parseTo(to);
  return (
    <TSLink
      ref={ref as never}
      to={pathname as never}
      search={search as never}
      hash={hash}
      replace={replace}
      state={state as never}
      {...((rest ?? {}) as Record<string, unknown>)}
    >
      {children}
    </TSLink>
  );
});

// ---------- Navigate ----------

export function Navigate({
  to,
  replace,
  state,
}: {
  to: string;
  replace?: boolean;
  state?: unknown;
}) {
  if (!hasTanStackRouter()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-router-dom") as typeof import("react-router-dom");
    const RrNavigate = mod.Navigate;
    return <RrNavigate to={to} replace={replace} state={state as never} />;
  }
  const { pathname, search, hash } = parseTo(to);
  return (
    <TSNavigate
      to={pathname as never}
      search={search as never}
      hash={hash}
      state={state as never}
      replace={replace}
    />
  );
}

// ---------- Outlet ----------

export const Outlet = TSOutlet;

// ---------- NavLink (React Router-compatible active-state wrapper) ----------

export type NavLinkProps = Omit<
  ComponentPropsWithoutRef<"a">,
  "href" | "className" | "children" | "style"
> & {
  to: string;
  replace?: boolean;
  state?: unknown;
  end?: boolean;
  className?:
    | string
    | ((state: { isActive: boolean; isPending: boolean }) => string);
  style?:
    | CSSProperties
    | ((state: {
        isActive: boolean;
        isPending: boolean;
      }) => CSSProperties | undefined);
  children?:
    | ReactNode
    | ((state: { isActive: boolean; isPending: boolean }) => ReactNode);
};

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(
  function NavLink(
    { to, replace, state, end = false, className, style, children, ...rest },
    ref,
  ) {
    const location = useLocation();
    const target = parseTo(to).pathname;
    const isActive = end
      ? location.pathname === target
      : location.pathname === target ||
        location.pathname.startsWith(`${target}/`);
    const navState = { isActive, isPending: false };
    return (
      <Link
        ref={ref}
        to={to}
        replace={replace}
        state={state as never}
        className={
          typeof className === "function" ? className(navState) : className
        }
        style={typeof style === "function" ? style(navState) : style}
        {...rest}
      >
        {typeof children === "function" ? children(navState) : children}
      </Link>
    );
  },
);

export function useInRouterContext() {
  return true;
}
