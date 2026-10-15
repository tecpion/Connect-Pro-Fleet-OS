// Connect Pro Fleet — Build #20 list pagination hook.
//
// Limits DOM rendering for large lists (customers, rentals, transactions,
// tasks, claims) so the page doesn't render thousands of nodes. Provides a
// "Load more" increment. Default page size is tuned for operational lists.

import { useMemo, useState } from "react";

export function usePagination<T>(
  items: T[],
  initialPageSize = 25,
  increment = 25,
) {
  const [limit, setLimit] = useState(initialPageSize);

  const visible = useMemo(() => items.slice(0, limit), [items, limit]);
  const hasMore = items.length > limit;
  const remaining = Math.max(0, items.length - limit);

  function loadMore() {
    setLimit((l) => l + increment);
  }

  function reset() {
    setLimit(initialPageSize);
  }

  return { visible, hasMore, remaining, loadMore, reset, total: items.length };
}
