import { useEffect, useState } from "react";
import { request } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { Card, Icon, Spinner } from "../components/ui";
import { formatDuration, formatNumber } from "../lib/format";

interface HealthStatus {
  status: string;
  env: string;
  db: boolean;
}

interface ConsumerStats {
  uptime_sec?: number;
  uptime_seconds?: number;
  received?: number;
  total_messages_received?: number;
  inserted?: number;
  total_inserts?: number;
  duplicates?: number;
  invalid?: number;
  errors?: number;
  total_errors?: number;
  attendance_created?: number;
  attendance_updated?: number;
  unknown_employees?: number;
}

export function SystemHealth() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [consumer, setConsumer] = useState<ConsumerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchStatus = async () => {
      try {
        const [healthData, consumerData] = await Promise.all([
          request<HealthStatus>("/health", { auth: false }),
          request<ConsumerStats>("/_ops/consumer"),
        ]);
        if (mounted) {
          setHealth(healthData);
          setConsumer(consumerData);
          setError(null);
        }
      } catch (err: unknown) {
        if (mounted) {
          setError(
            err instanceof Error ? err.message : "Failed to fetch system status",
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    void fetchStatus();

    // Auto-refresh every 10 seconds
    const timer = setInterval(fetchStatus, 10_000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  if (loading && !health) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" label="Loading system health..." />
      </div>
    );
  }

  const uptimeSec = consumer?.uptime_sec ?? consumer?.uptime_seconds ?? 0;
  const receivedCount =
    consumer?.received ?? consumer?.total_messages_received ?? 0;
  const insertedCount =
    consumer?.inserted ?? consumer?.total_inserts ?? 0;
  const errorCount = consumer?.errors ?? consumer?.total_errors ?? 0;
  const duplicatesCount = consumer?.duplicates ?? 0;
  const attendanceCreated = consumer?.attendance_created ?? 0;
  const attendanceUpdated = consumer?.attendance_updated ?? 0;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="System Health"
        description="Monitor backend services, database status, and real-time MQTT consumer metrics."
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-950/50 dark:text-red-400">
              <p className="flex items-center gap-2 font-medium">
                <Icon name="alert" className="h-5 w-5" />
                Error: {error}
              </p>
            </div>
          )}

          <div className="grid gap-6 sm:grid-cols-2">
            {/* API Health Card */}
            <Card className="flex flex-col p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  FastAPI Server
                </h3>
                <Icon name="dashboard" className="h-6 w-6 text-indigo-500" />
              </div>
              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Status</span>
                  <span
                    className={`font-medium ${
                      health?.status === "ok"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {health?.status?.toUpperCase() ?? "UNKNOWN"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">
                    Environment
                  </span>
                  <span className="font-medium text-slate-900 dark:text-slate-200">
                    {health?.env ?? "N/A"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">
                    Database Connection
                  </span>
                  <div className="flex items-center gap-1.5">
                    {health?.db ? (
                      <>
                        <div className="h-2 w-2 rounded-full bg-emerald-500" />
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">
                          Connected
                        </span>
                      </>
                    ) : (
                      <>
                        <div className="h-2 w-2 rounded-full bg-red-500" />
                        <span className="font-medium text-red-600 dark:text-red-400">
                          Disconnected
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {/* MQTT Consumer Card */}
            <Card className="flex flex-col p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Edge MQTT Consumer
                </h3>
                <Icon name="dashboard" className="h-6 w-6 text-sky-500" />
              </div>
              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Uptime</span>
                  <span className="font-medium text-slate-900 dark:text-slate-200">
                    {consumer ? formatDuration(uptimeSec) : "N/A"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">
                    Messages Received
                  </span>
                  <span className="font-medium text-slate-900 dark:text-slate-200">
                    {formatNumber(receivedCount)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">
                    Records Inserted
                  </span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    {formatNumber(insertedCount)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">
                    Duplicates Ignored
                  </span>
                  <span className="font-medium text-slate-900 dark:text-slate-200">
                    {formatNumber(duplicatesCount)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">
                    Attendance Created / Updated
                  </span>
                  <span className="font-medium text-slate-900 dark:text-slate-200">
                    {formatNumber(attendanceCreated)} / {formatNumber(attendanceUpdated)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Errors</span>
                  <span
                    className={`font-medium ${
                      errorCount > 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-slate-900 dark:text-slate-200"
                    }`}
                  >
                    {formatNumber(errorCount)}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
