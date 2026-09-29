import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Employee, LeaveRequest, LeaveType, Page } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { StatusBadge } from "../components/StatusBadge";

export function Leaves() {
  const { user } = useAuth();
  const canReview = user?.role === "admin" || user?.role === "manager";

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filter, setFilter] = useState("pending");
  const [showNew, setShowNew] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const params = new URLSearchParams();
      if (filter) params.set("status", filter);
      const [r, t, e] = await Promise.all([
        api.get<LeaveRequest[]>("/leaves?" + params),
        api.get<LeaveType[]>("/leaves/types"),
        api.get<Page<Employee>>("/employees?limit=500"),
      ]);
      setRequests(r);
      setTypes(t);
      setEmployees(e.items);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    }
  }

  useEffect(() => {
    load();
  }, [filter]);

  async function review(id: string, status: "approved" | "rejected") {
    setBusy(true);
    try {
      await api.post("/leaves/" + id + "/review", { status });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Review failed");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    if (!confirm("Cancel this leave request?")) return;
    try {
      await api.post("/leaves/" + id + "/cancel");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Cancel failed");
    }
  }

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Leave management</h1>
          <p className="text-sm text-slate-500 mt-1">
            {requests.length} {filter || "total"} request(s)
          </p>
        </div>
        <button
          onClick={() => setShowNew((v) => !v)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700"
        >
          {showNew ? "Cancel" : "+ Request leave"}
        </button>
      </div>

      {showNew && (
        <NewLeaveForm
          types={types}
          employees={employees}
          onCreated={async () => { setShowNew(false); await load(); }}
        />
      )}

      <div className="flex gap-2 mb-4">
        {["pending", "approved", "rejected", "cancelled", ""].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={"px-3 py-1.5 text-xs font-semibold rounded-lg " +
              (filter === s ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50")}
          >
            {s || "all"}
          </button>
        ))}
      </div>

      {err && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{err}</div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2.5">Employee</th>
              <th className="text-left px-4 py-2.5">Type</th>
              <th className="text-left px-4 py-2.5">From</th>
              <th className="text-left px-4 py-2.5">To</th>
              <th className="text-left px-4 py-2.5">Days</th>
              <th className="text-left px-4 py-2.5">Status</th>
              <th className="text-left px-4 py-2.5">Reviewed by</th>
              <th className="text-right px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => {
              const t = types.find((x) => x.code === r.leave_type);
              return (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-mono text-xs">{r.employee_code}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold text-white" style={{ background: t?.color ?? "#6b7280" }}>
                      {t?.name ?? r.leave_type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{r.start_date}</td>
                  <td className="px-4 py-2.5">{r.end_date}</td>
                  <td className="px-4 py-2.5">{r.days_requested}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{r.reviewed_by ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    {canReview && r.status === "pending" && (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => review(r.id, "approved")} disabled={busy} className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100">
                          Approve
                        </button>
                        <button onClick={() => review(r.id, "rejected")} disabled={busy} className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100">
                          Reject
                        </button>
                      </div>
                    )}
                    {r.status === "pending" && !canReview && (
                      <button onClick={() => cancel(r.id)} className="text-xs px-2 py-1 border border-slate-300 rounded hover:bg-slate-50">
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {requests.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-slate-400">
                  No {filter || ""} leave requests.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function NewLeaveForm({
  types, employees, onCreated,
}: {
  types: LeaveType[];
  employees: Employee[];
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    employee_code: "",
    leave_type: "",
    start_date: "",
    end_date: "",
    reason: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.post("/leaves", {
        ...form,
        reason: form.reason || null,
      });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="bg-white border border-slate-200 rounded-xl p-5 mb-4 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="Employee">
          <select className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} required>
            <option value="">—</option>
            {employees.map((e) => (
              <option key={e.id} value={e.code}>{e.name} ({e.code})</option>
            ))}
          </select>
        </Field>
        <Field label="Leave type">
          <select className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })} required>
            <option value="">—</option>
            {types.map((t) => (
              <option key={t.code} value={t.code}>{t.name}</option>
            ))}
          </select>
        </Field>
        <Field label="From">
          <input type="date" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required />
        </Field>
        <Field label="To">
          <input type="date" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} required />
        </Field>
      </div>
      <Field label="Reason (optional)">
        <input className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
      </Field>
      <div className="flex gap-3">
        <button type="submit" disabled={busy} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
          {busy ? "Submitting..." : "Submit request"}
        </button>
      </div>
      {err && <div className="text-sm text-red-600">{err}</div>}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
