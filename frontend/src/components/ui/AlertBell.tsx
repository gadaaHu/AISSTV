/**
 * AlertBell — shows a bell icon in the topbar.
 * Pulses red and shows an unread count when new alerts arrive.
 * Clicking it clears the unread count and shows the last alert summary.
 */
import { useCallback, useRef, useState } from "react";
import type { AlertPayload } from "../../hooks/useAlertStream";
import { cn } from "../../lib/utils";
import { Icon } from "./Icon";

export interface AlertBellProps {
  latestAlert: AlertPayload | null;
  unreadCount: number;
  onClear: () => void;
}

export function AlertBell({ latestAlert, unreadCount, onClear }: AlertBellProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleToggle = useCallback(() => {
    setPanelOpen((prev) => {
      if (!prev) onClear();
      return !prev;
    });
  }, [onClear]);

  // Close when clicking outside
  const handleBlur = useCallback((e: React.FocusEvent) => {
    if (!panelRef.current?.contains(e.relatedTarget)) {
      setPanelOpen(false);
    }
  }, []);

  function alertLabel(alert: AlertPayload): string {
    if (alert.kind === "safety_incident") {
      return `Safety incident (Tier ${alert.tier ?? "?"}) at ${alert.zone ?? alert.camera_id ?? "unknown location"}`;
    }
    if (alert.kind === "fraud_incident") {
      return `Fraud alert at ${alert.zone ?? alert.camera_id ?? "unknown location"}`;
    }
    return alert.kind ?? "New alert";
  }

  return (
    <div className="relative" ref={panelRef} onBlur={handleBlur}>
      <button
        type="button"
        aria-label={unreadCount > 0 ? `${unreadCount} new alert${unreadCount > 1 ? "s" : ""}` : "Alerts"}
        aria-expanded={panelOpen}
        onClick={handleToggle}
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
          "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white",
          unreadCount > 0 && "text-rose-600 dark:text-rose-400",
        )}
      >
        <Icon name="alert" className="h-5 w-5" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white animate-pulse"
            aria-hidden
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {panelOpen && (
        <div
          role="dialog"
          aria-label="Recent alerts"
          className={cn(
            "absolute right-0 top-11 z-50 w-80 rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900",
          )}
        >
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Alerts</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Real-time safety and fraud notifications
            </p>
          </div>

          <div className="max-h-72 overflow-y-auto p-3">
            {latestAlert ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-800 dark:bg-rose-950/30">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white">
                    <Icon name="alert" className="h-3 w-3" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-rose-900 dark:text-rose-200">
                      {alertLabel(latestAlert)}
                    </p>
                    {latestAlert.detected_at && (
                      <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-400">
                        {new Date(latestAlert.detected_at).toLocaleTimeString()}
                      </p>
                    )}
                    {latestAlert.confidence !== undefined && (
                      <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-400">
                        Confidence: {Math.round(latestAlert.confidence * 100)}%
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <Icon name="check" className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No alerts yet
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Safety and fraud events will appear here
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
