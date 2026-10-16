import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Build #33 — recharts ResponsiveContainer (used by Dashboard / Executive charts)
// calls ResizeObserver at construction time. jsdom does not define it, so
// provide a no-op stub so the pages are render-testable.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(
  globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }
).ResizeObserver = ResizeObserverStub;

// Radix UI primitives (DropdownMenu, Dialog, Popover, etc.) call
// hasPointerCapture / setPointerCapture during pointer interactions. jsdom
// does not implement the Pointer Capture API, so stub them as no-ops so the
// components are interactive in the test environment.
(
  HTMLElement.prototype as unknown as {
    hasPointerCapture: () => boolean;
  }
).hasPointerCapture = () => false;
(
  HTMLElement.prototype as unknown as {
    setPointerCapture: () => void;
  }
).setPointerCapture = () => {};
(
  HTMLElement.prototype as unknown as {
    releasePointerCapture: () => void;
  }
).releasePointerCapture = () => {};
// Radix also reads scrollLeft/scrollTop during layout; jsdom reports 0 which
// is fine, but ensure Element.scrollIntoView is defined for any focus code.
if (
  !(Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView
) {
  (
    Element.prototype as unknown as { scrollIntoView: () => void }
  ).scrollIntoView = () => {};
}
