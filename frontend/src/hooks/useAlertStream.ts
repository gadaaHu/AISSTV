/**
 * useAlertStream — connects to the SSE `/api/alerts/stream` endpoint
 * and fires a callback for every alert that arrives.
 *
 * The hook automatically reconnects with exponential back-off when the
 * connection is dropped. It tears the stream down cleanly when the
 * component that owns it unmounts.
 */
import { useEffect, useRef } from "react";

export interface AlertPayload {
  kind: string;
  incident_id?: string;
  tier?: number;
  tier_name?: string;
  camera_id?: string;
  zone?: string;
  detected_at?: string;
  signals?: string[];
  confidence?: number;
  status?: string;
  // general-purpose fields from the fraud / general broadcast
  [key: string]: unknown;
}

const MIN_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;

export function useAlertStream(
  token: string | null,
  onAlert: (alert: AlertPayload) => void,
) {
  const callbackRef = useRef(onAlert);

  useEffect(() => {
    callbackRef.current = onAlert;
  });

  useEffect(() => {
    if (!token) return;

    let es: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let backoff = MIN_BACKOFF_MS;
    let stopped = false;

    const connect = () => {
      if (stopped) return;

      // EventSource doesn't support custom headers so we pass the token in
      // the query-string. The backend's current_user dep reads the Bearer
      // token from the Authorization header only, so we need a small shim:
      // use the fetch-based ReadableStream approach instead.
      const url = `/api/alerts/stream`;

      const ctrl = new AbortController();

      void fetch(url, {
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
        .then(async (resp) => {
          if (!resp.ok || !resp.body) {
            throw new Error(`SSE fetch failed: ${resp.status}`);
          }

          backoff = MIN_BACKOFF_MS; // reset on successful connection

          const reader = resp.body
            .pipeThrough(new TextDecoderStream())
            .getReader();

          let buffer = "";

          while (!stopped) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += value;
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            let currentEvent = "";
            let currentData = "";

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                currentEvent = line.slice("event: ".length).trim();
              } else if (line.startsWith("data: ")) {
                currentData = line.slice("data: ".length).trim();
              } else if (line === "" && currentData) {
                // dispatch
                if (currentEvent !== "hello" && currentData) {
                  try {
                    const payload = JSON.parse(currentData) as AlertPayload;
                    callbackRef.current(payload);
                  } catch {
                    // ignore malformed frames
                  }
                }
                currentEvent = "";
                currentData = "";
              }
            }
          }
        })
        .catch(() => {
          if (stopped) return;
          // Schedule reconnect with back-off
          retryTimeout = setTimeout(() => {
            backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
            connect();
          }, backoff);
        });

      es = { close: () => ctrl.abort() } as unknown as EventSource;
    };

    connect();

    return () => {
      stopped = true;
      es?.close();
      if (retryTimeout !== null) clearTimeout(retryTimeout);
    };
  }, [token]);
}
