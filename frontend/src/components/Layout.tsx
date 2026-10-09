import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { getToken } from "../api/client";
import { useAuth } from "../auth/useAuth";
import type { AlertPayload } from "../hooks/useAlertStream";
import { useAlertStream } from "../hooks/useAlertStream";
import { roleStyle } from "../lib/constants";
import { cn } from "../lib/utils";
import {
  AlertBell,
  Avatar,
  Button,
  Icon,
  IconButton,
  StatusBadge,
  ThemeToggle,
  type IconName,
  useToast,
} from "./ui";

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: "dashboard" },
  { to: "/cameras", label: "Cameras", icon: "camera" },
  { to: "/employees", label: "Employees", icon: "employees" },
  { to: "/leaves", label: "Leaves", icon: "leaves" },
  { to: "/events", label: "Events", icon: "events" },
  { to: "/users", label: "Users", icon: "employees" },
  { to: "/health", label: "System Health", icon: "dashboard" },
];

/**
 * The signed-in shell: a persistent sidebar from `md` up, and a slide-over
 * drawer below it.
 *
 * Every page is readable by every role — the backend restricts *mutations*, not
 * reading — so the navigation is not filtered. Individual actions are gated
 * where they appear.
 */
export function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [latestAlert, setLatestAlert] = useState<AlertPayload | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // A navigation from inside the drawer should close it.
  // Setting state inside an effect is intentional: we are reacting to a route
  // change (an external event), not to component state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrawerOpen(false);
  }, [location.pathname]);

  const handleSignOut = () => {
    void signOut();
    void navigate("/login", { replace: true });
  };

  const handleAlert = useCallback(
    (alert: AlertPayload) => {
      setLatestAlert(alert);
      setUnreadCount((n) => n + 1);

      // Also pop a toast for immediate visibility
      const label =
        alert.kind === "safety_incident"
          ? `Safety incident (Tier ${alert.tier ?? "?"}) — ${alert.zone ?? alert.camera_id ?? "unknown"}`
          : alert.kind === "fraud_incident"
            ? `Fraud alert — ${alert.zone ?? alert.camera_id ?? "unknown"}`
            : `New alert: ${alert.kind}`;

      toast.error(label, "Click the bell icon for details");

      // Browser notification if permitted
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("AISSTV Alert", { body: label, icon: "/favicon.ico" });
      }
    },
    [toast],
  );

  // Connect the SSE stream. getToken() reads localStorage so we can call it
  // at render time without needing it in props or context.
  useAlertStream(getToken(), handleAlert);

  // Request browser notification permission once when user signs in
  useEffect(() => {
    if (user && typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, [user]);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[260px_1fr]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>

      {drawerOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm md:hidden"
        />
      )}

      <aside
        className={cn(
          "gemini-sidebar fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-slate-800 transition-transform duration-200 ease-out",
          "md:static md:translate-x-0",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <span className="gemini-border gemini-float grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-600 text-white">
            <Icon name="camera" className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="gemini-text block truncate text-sm font-semibold">
              AISSTV
            </span>
            <span className="block truncate text-[11px] uppercase tracking-wider text-slate-400">
              Attendance console
            </span>
          </span>
          <IconButton
            icon="close"
            label="Close navigation"
            variant="ghost"
            className="ml-auto text-slate-400 hover:bg-slate-800 hover:text-white md:hidden"
            onClick={() => setDrawerOpen(false)}
          />
        </div>

        <nav aria-label="Main" className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "gemini-nav-active text-white"
                    : "text-slate-300 hover:bg-slate-800/70 hover:text-white",
                )
              }
            >
              <Icon
                name={item.icon}
                className={cn(
                  "h-5 w-5 shrink-0 transition-all duration-200",
                  "group-hover:drop-shadow-[0_0_6px_#4285f4aa]",
                )}
              />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-800 p-4">
          <div className="mb-3 flex items-center gap-3">
            <Avatar name={user?.full_name ?? user?.username ?? "?"} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {user?.full_name ?? user?.username}
              </p>
              <p className="truncate text-xs text-slate-400">{user?.username}</p>
            </div>
          </div>

          <div className="mb-3">
            <StatusBadge style={roleStyle(user?.role)} />
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="w-full justify-start text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <Icon name="logout" className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/90 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90">
          <IconButton
            icon="menu"
            label="Open navigation"
            variant="ghost"
            className="md:hidden"
            onClick={() => setDrawerOpen(true)}
          />

          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Attendance console
          </span>

          <div className="ml-auto flex items-center gap-2">
            <AlertBell
              latestAlert={latestAlert}
              unreadCount={unreadCount}
              onClear={() => setUnreadCount(0)}
            />
            <ThemeToggle />
          </div>
        </header>

        <main id="main-content" className="flex-1 p-4 md:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
