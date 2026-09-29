import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const NAV = [
  { to: "/", label: "Dashboard", icon: "◉" },
  { to: "/cameras", label: "Cameras", icon: "◐" },
  { to: "/leaves", label: "Leaves", icon: "▤" },
  { to: "/events", label: "Events", icon: "☰" },
  { to: "/employees", label: "Employees", icon: "◍" },
];

export function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [toast, setToast] = useState<{ type: string; msg: string } | null>(null);

  function handleLogout() {
    logout();
    nav("/login", { replace: true });
  }

  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr] bg-slate-50">
      <aside className="bg-slate-900 text-white flex flex-col p-4">
        <div className="flex items-center gap-2 px-2 mb-8">
          <div className="w-9 h-9 rounded-lg bg-blue-600 grid place-items-center font-bold text-lg">
            A
          </div>
          <div>
            <div className="font-bold">Attendance</div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">
              Management
            </div>
          </div>
        </div>

        <nav className="flex-1 flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                "flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors " +
                (isActive
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white")
              }
            >
              <span className="text-lg w-5 text-center">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-800 pt-3 mt-3">
          <div className="px-2 mb-3">
            <div className="text-sm font-semibold">{user?.username}</div>
            <div className="text-xs text-slate-400">{user?.role}</div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 text-sm rounded-lg text-slate-300 hover:bg-slate-800"
          >
            → Log out
          </button>
        </div>
      </aside>

      <main className="overflow-auto">
        <div className="p-8 max-w-7xl mx-auto">
          <Outlet context={{ showToast: setToast }} />
        </div>
      </main>

      {toast && (
        <div
          className={"fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-2xl text-white max-w-sm " +
            (toast.type === "error" ? "bg-red-600" : "bg-green-600")}
          onClick={() => setToast(null)}
        >
          <div className="text-sm font-semibold">{toast.msg}</div>
        </div>
      )}
    </div>
  );
}
