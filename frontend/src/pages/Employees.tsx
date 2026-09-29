import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Employee, Page } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { StatusBadge } from "../components/StatusBadge";

export function Employees() {
  const { user } = useAuth();
  const canEdit = user?.role === "admin";

  const [items, setItems] = useState<Employee[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  async function load() {
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (q) params.set("q", q);
      const data = await api.get<Page<Employee>>("/employees?" + params);
      setItems(data.items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    }
  }

  useEffect(() => {
    const id = setTimeout(load, 200);
    return () => clearTimeout(id);
  }, [q]);

  async function toggleActive(emp: Employee) {
    setBusy(true);
    try {
      if (emp.active) await api.del("/employees/" + emp.code);
      else await api.patch("/employees/" + emp.code, { active: true });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Employees</h1>
          <p className="text-sm text-slate-500 mt-1">{items.length} registered</p>
        </div>
        {canEdit && (
          <button onClick={() => setShowNew((v) => !v)} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700">
            {showNew ? "Cancel" : "+ Add employee"}
          </button>
        )}
      </div>

      {showNew && (
        <NewEmployeeForm onCreated={async () => { setShowNew(false); await load(); }} />
      )}

      <div className="mb-4 max-w-sm">
        <input className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {err && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{err}</div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2.5">Code</th>
              <th className="text-left px-4 py-2.5">Name</th>
              <th className="text-left px-4 py-2.5">Department</th>
              <th className="text-left px-4 py-2.5">Shift</th>
              <th className="text-left px-4 py-2.5">Status</th>
              <th className="text-right px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id} className="border-t border-slate-100">
                <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{e.code}</td>
                <td className="px-4 py-2.5 font-semibold">{e.name}</td>
                <td className="px-4 py-2.5 text-slate-600">{e.department ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-600">{e.shift_start.slice(0, 5)} – {e.shift_end.slice(0, 5)}</td>
                <td className="px-4 py-2.5"><StatusBadge status={e.active ? "present" : "absent"} /></td>
                <td className="px-4 py-2.5 text-right">
                  {canEdit && (
                    <button onClick={() => toggleActive(e)} disabled={busy} className="text-xs px-2 py-1 border border-slate-300 rounded hover:bg-slate-50">
                      {e.active ? "Deactivate" : "Reactivate"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-slate-400">No employees found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function NewEmployeeForm({ onCreated }: { onCreated: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post("/employees", { code, name, department: department || null });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    }
  }

  return (
    <form onSubmit={submit} className="bg-white border border-slate-200 rounded-xl p-5 mb-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Code</label>
        <input className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" value={code} onChange={(e) => setCode(e.target.value)} required />
      </div>
      <div className="md:col-span-2">
        <label className="block text-xs font-medium text-slate-600 mb-1">Full name</label>
        <input className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Department</label>
        <input className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" value={department} onChange={(e) => setDepartment(e.target.value)} />
      </div>
      <button className="md:col-span-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold">Create</button>
      {err && <div className="md:col-span-4 text-sm text-red-600">{err}</div>}
    </form>
  );
}
