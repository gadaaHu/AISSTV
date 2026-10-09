import { useEffect, useState } from "react";

/**
 * Returns a debounced version of `value` that only updates after `delayMs`
 * has passed without a new value.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debouncedValue;
}

export function useDebounce<T>(value: T, delayMs: number): T {
  return useDebouncedValue(value, delayMs);
}
