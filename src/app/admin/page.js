"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell, Check, ChevronRight, CircleUserRound, Clock3, Home, LayoutDashboard,
  Mail, RefreshCw, Search, ShieldAlert, ShieldCheck, Users, X,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { enableAdminPush, pushSupported } from "../../lib/pushClient";

const TABS = [
  { id: "overview", label: "Overview", Icon: LayoutDashboard },
  { id: "requests", label: "Gmail requests", Icon: Mail },
  { id: "users", label: "Users", Icon: Users },
];
const ago = (value) => {
  if (!value) return "Never";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 2) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
  return `${Math.floor(minutes / 1440)} days ago`;
};

async function adminApi(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token || ""}`, ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || "Request failed."), { status: response.status });
  return body;
}

function Stat({ label, value, hint, Icon, tone = "purple" }) {
  const tones = { purple: "bg-purple-500/15 text-purple-300", green: "bg-emerald-500/15 text-emerald-300", amber: "bg-amber-500/15 text-amber-300", blue: "bg-blue-500/15 text-blue-300" };
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}><Icon size={18} /></span>
      <p className="mt-4 text-3xl font-extrabold tabular-nums">{value}</p>
      <p className="text-sm font-medium text-zinc-300">{label}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "requests" ? "requests" : "overview"
  );
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState({});

  const load = useCallback(async () => {
    setError("");
    try { setData(await adminApi("/api/admin/dashboard")); }
    catch (loadError) { setError(loadError.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const requests = data?.requests || [];
  const users = data?.users || [];
  const pending = requests.filter((request) => request.status === "pending");
  const active7 = users.filter((user) => user.last_active_at && Date.now() - new Date(user.last_active_at) < 7 * 86400000).length;
  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((user) => `${user.full_name || ""} ${user.email || ""}`.toLowerCase().includes(needle));
  }, [users, query]);

  const updateRequest = async (id, status) => {
    setBusy(id + status);
    setError("");
    try {
      const result = await adminApi("/api/admin/gmail-requests", { method: "PATCH", body: JSON.stringify({ id, status, note: notes[id] || "" }) });
      setData((current) => ({ ...current, requests: current.requests.map((request) => request.id === id ? result.request : request) }));
      setNotes((current) => ({ ...current, [id]: "" }));
    } catch (updateError) { setError(updateError.message); }
    setBusy("");
  };

  const enableNotifications = async () => {
    setBusy("push");
    try { await enableAdminPush(); setError(""); alert("Admin notifications are on for this device."); }
    catch (pushError) { setError(pushError.message); }
    setBusy("");
  };

  if (error && !data && /owner access/i.test(error)) {
    return (
      <div className="flex min-h-screen items-center justify-center p-5 text-white">
        <div className="max-w-sm rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <ShieldAlert className="mx-auto text-red-400" size={42} />
          <h1 className="mt-4 text-xl font-bold">Owner access only</h1>
          <p className="mt-2 text-sm text-zinc-400">This area is restricted to the JobChain owner account.</p>
          <Link href="/home" className="mt-5 inline-flex rounded-xl bg-white px-5 py-2.5 font-semibold text-black">Back to JobChain</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white md:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-zinc-800 bg-zinc-950 p-5 md:flex">
        <Link href="/admin" className="flex items-center gap-3 px-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600"><ShieldCheck size={21} /></span>
          <span><strong className="block">JobChain</strong><span className="text-xs uppercase tracking-wider text-purple-300">Owner admin</span></span>
        </Link>
        <nav className="mt-8 space-y-1">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${tab === id ? "bg-purple-500/15 text-purple-200" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"}`}>
              <Icon size={18} /><span className="flex-1 text-left">{label}</span>
              {id === "requests" && pending.length ? <span className="rounded-full bg-purple-600 px-2 py-0.5 text-xs text-white">{pending.length}</span> : null}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-2 border-t border-zinc-800 pt-4">
          <button type="button" onClick={enableNotifications} disabled={busy === "push" || !pushSupported()}
            className="flex w-full items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2.5 text-sm text-zinc-300 hover:border-purple-500 disabled:opacity-50">
            <Bell size={17} /> {busy === "push" ? "Enabling..." : "Enable request alerts"}
          </button>
          <Link href="/home" className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-white"><Home size={17} /> Back to JobChain</Link>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-zinc-800 bg-zinc-950/90 px-4 py-3 backdrop-blur md:hidden">
        <ShieldCheck className="text-purple-300" /><strong className="flex-1">JobChain Admin</strong>
        <button type="button" onClick={enableNotifications} className="rounded-lg border border-zinc-700 p-2"><Bell size={17} /></button>
        <Link href="/home" className="rounded-lg border border-zinc-700 p-2"><Home size={17} /></Link>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 md:py-9">
        {error ? <div className="mb-5 flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"><span>{error}</span><button onClick={load} className="font-semibold underline">Retry</button></div> : null}
        {!data ? <div className="flex min-h-[60vh] items-center justify-center"><RefreshCw className="animate-spin text-purple-300" /></div> : tab === "overview" ? (
          <>
            <h1 className="text-3xl font-extrabold">Overview</h1>
            <p className="mt-1 text-zinc-500">JobChain health at a glance</p>
            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Users" value={users.length} hint="Total accounts" Icon={Users} />
              <Stat label="Active this week" value={active7} hint={`${users.length ? Math.round(active7 / users.length * 100) : 0}% of users`} Icon={Clock3} tone="blue" />
              <Stat label="Pending Gmail" value={pending.length} hint="Need Google Console access" Icon={Mail} tone="amber" />
              <Stat label="Gmail connected" value={users.filter((user) => user.gmail).length} hint="Ready to send" Icon={Check} tone="green" />
            </div>
            <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="flex items-center justify-between"><div><h2 className="font-semibold">Gmail access queue</h2><p className="text-sm text-zinc-500">Add the exact address in Google Console before approving.</p></div><button onClick={() => setTab("requests")} className="text-sm font-semibold text-purple-300">Open queue →</button></div>
              {pending.length ? <ul className="mt-4 divide-y divide-zinc-800">{pending.slice(0, 5).map((request) => <li key={request.id} className="flex items-center gap-3 py-3"><CircleUserRound className="text-zinc-500" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{request.full_name || request.account_email}</strong><span className="block truncate text-xs text-zinc-500">{request.requested_email}</span></span><span className="text-xs text-zinc-500">{ago(request.requested_at)}</span></li>)}</ul> : <p className="mt-5 text-sm text-zinc-500">No requests waiting.</p>}
            </section>
          </>
        ) : tab === "requests" ? (
          <>
            <h1 className="text-3xl font-extrabold">Gmail requests</h1>
            <p className="mt-1 text-zinc-500">Google OAuth test-user approvals</p>
            <div className="mt-6 space-y-3">
              {requests.map((request) => (
                <article key={request.id} className={`rounded-2xl border p-5 ${request.status === "pending" ? "border-amber-500/30 bg-amber-500/[0.05]" : "border-zinc-800 bg-zinc-900"}`}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{request.full_name || "JobChain user"}</h2><span className={`rounded-full border px-2 py-0.5 text-xs capitalize ${request.status === "pending" ? "border-amber-500/40 text-amber-300" : request.status === "approved" || request.status === "connected" ? "border-emerald-500/40 text-emerald-300" : "border-red-500/40 text-red-300"}`}>{request.status}</span></div>
                      <p className="mt-2 break-all text-lg font-medium text-white">{request.requested_email}</p>
                      <p className="mt-1 text-xs text-zinc-500">Account: {request.account_email} · requested {ago(request.requested_at)}</p>
                    </div>
                    {request.status === "pending" ? (
                      <div className="flex flex-wrap gap-2">
                        <button disabled={busy} onClick={() => updateRequest(request.id, "approved")} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50"><Check size={16} /> Mark added & approve</button>
                        <button disabled={busy} onClick={() => updateRequest(request.id, "rejected")} className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/40 px-4 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50"><X size={16} /> Needs correction</button>
                      </div>
                    ) : null}
                  </div>
                  {request.status === "pending" ? <input value={notes[request.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))} placeholder="Optional note if the address needs correction" className="mt-4 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-purple-500" /> : request.review_note ? <p className="mt-3 text-sm text-zinc-400">Note: {request.review_note}</p> : null}
                </article>
              ))}
              {!requests.length ? <p className="rounded-2xl border border-dashed border-zinc-700 p-10 text-center text-zinc-500">No Gmail access requests yet.</p> : null}
            </div>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-extrabold">Users</h1>
            <p className="mt-1 text-zinc-500">Accounts, activity and application progress</p>
            <div className="relative mt-6"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or email" className="w-full rounded-xl border border-zinc-700 bg-zinc-900 py-3 pl-10 pr-3 text-sm outline-none focus:border-purple-500" /></div>
            <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900"><ul className="divide-y divide-zinc-800">{filteredUsers.map((user) => <li key={user.id} className="flex items-center gap-3 px-4 py-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-600 font-bold">{(user.full_name || user.email || "?")[0].toUpperCase()}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{user.full_name || user.email?.split("@")[0]}</strong><span className="block truncate text-xs text-zinc-500">{user.email}</span></span><span className="hidden text-right text-xs text-zinc-500 sm:block">Active {ago(user.last_active_at)}<br />{user.drafts.sent} sent · {user.drafts.failed} failed</span>{user.gmail ? <span title="Gmail connected" className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> : <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />}<ChevronRight size={15} className="text-zinc-600" /></li>)}</ul>{!filteredUsers.length ? <p className="p-8 text-center text-sm text-zinc-500">No users match.</p> : null}</div>
          </>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"><div className="flex">{TABS.map(({ id, label, Icon }) => <button key={id} onClick={() => setTab(id)} className={`relative flex flex-1 flex-col items-center gap-1 py-2 text-[10px] ${tab === id ? "text-purple-300" : "text-zinc-500"}`}><Icon size={20} />{label}{id === "requests" && pending.length ? <span className="absolute right-5 top-1 rounded-full bg-purple-600 px-1 text-[9px] text-white">{pending.length}</span> : null}</button>)}</div></nav>
    </div>
  );
}
