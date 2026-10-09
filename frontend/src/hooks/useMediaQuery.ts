import { useCallback, useSyncExternalStore } from "react";

/** Tailwind's `md` breakpoint, for the few places CSS alone cannot decide. */
export const MEDIA_QUERY_MD = "(min-width: 768px)";

const SERVER_SNAPSHOT = false;

/**
 * Subscribes to a CSS media query.
 *
 * The layout is responsive with pure CSS; this exists only where a component
 * must render *different markup* rather than restyle the same markup.
 *
 * Implemented with `useSyncExternalStore`, which is the React-blessed way to
 * read from an external source like `matchMedia`. The obvious `useEffect` +
 * `useState` version needs a synchronous `setState` on mount, which triggers a
 * cascading render — React's own lint rule rejects it.
 */
export function useMediaQuery(query: string = MEDIA_QUERY_MD): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onStoreChange);
      return () => media.removeEventListener("change", onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback((): boolean => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  const getServerSnapshot = useCallback((): boolean => SERVER_SNAPSHOT, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
