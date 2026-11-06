"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, CheckCircle2, Megaphone, RefreshCw, Send, Smartphone, Users } from "lucide-react";

const OPENS = [
  ["/home", "Home"], ["/jobs", "Jobs"], ["/jobpilot", "JobPilot"],
  ["/jobpilot?tab=drafts", "Drafts"], ["/applied", "Applied"], ["/profile", "Profile"],
];
const device = (ua = "") => (/iphone|ipad/i.test(ua) ? "iPhone" : /android/i.test(ua) ? "Android" : /mac/i.test(ua) ? "Mac" : /windows/i.test(ua) ? "Windows" : "Browser");
const nameOf = (user) => user?.full_name || user?.email?.split("@")[0] || "User";
const firstName = (user) => nameOf(user).split(" ")[0];

function Section({ title, sub, children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-5 ${className}`}>
      <h2 className="font-semibold">{title}</h2>
      {sub ? <p className="text-sm text-zinc-500">{sub}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Tile({ label, value, hint, Icon, tone }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon size={18} /></span>
      <p className="mt-4 text-3xl font-extrabold tabular-nums">{value}</p>
      <p className="text-sm font-medium text-zinc-300">{label}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export default function AdminNotifications({ users, adminApi, ago }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ title: "", body: "", url: "/home" });
  const [picked, setPicked] = useState(null); // null = everyone reachable, otherwise a Set of user ids
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const load = useCallback(() => {
    adminApi("/api/admin/notifications").then(setData).catch((error) => setNote({ ok: false, text: error.message }));
  }, [adminApi]);
  useEffect(() => { load(); }, [load]);

  const byId = useMemo(() => Object.fromEntries(users.map((user) => [user.id, user])), [users]);
  const reachableIds = useMemo(() => new Set((data?.devices || []).map((d) => d.user_id)), [data]);
  const reachable = users.filter((user) => reachableIds.has(user.id));
  const recipients = picked ? [...picked] : [...reachableIds];

  if (!data) {
    return (
      <>
        <h1 className="text-3xl font-extrabold">Notifications</h1>
        <div className="flex min-h-[40vh] items-center justify-center"><RefreshCw className="animate-spin text-purple-300" /></div>
        {note ? <p className="text-sm text-red-300">{note.text}</p> : null}
      </>
    );
  }

  const today = new Date().toDateString();
  const sentToday = data.messages.filter((m) => new Date(m.created_at).toDateString() === today).reduce((n, m) => n + (m.device_count || 0), 0);
  const reach = users.length ? Math.round((reachableIds.size / users.length) * 100) : 0;
  const matches = reachable.filter((user) => `${nameOf(user)} ${user.email}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8);
  const sample = picked?.size === 1 ? byId[[...picked][0]] : reachable[0];

  const togglePick = (id) => setPicked((current) => {
    const next = new Set(current || []);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  async function send(event) {
    event.preventDefault();
    if (!form.title.trim()) return setNote({ ok: false, text: "Add a title." });
    if (!recipients.length) return setNote({ ok: false, text: "Choose at least one person." });
    setBusy(true);
    setNote(null);
    try {
      const result = await adminApi("/api/admin/notifications", { method: "POST", body: JSON.stringify({ ...form, userIds: recipients }) });
      setNote({
        ok: result.sent > 0,
        text: result.configured === false ? "Push keys aren't set on this server, so nothing was sent."
          : `Sent to ${result.sent} device${result.sent === 1 ? "" : "s"}${result.failed ? `, ${result.failed} failed` : ""}${result.removed ? ` (${result.removed} old device${result.removed === 1 ? "" : "s"} removed)` : ""}.`,
      });
      setForm((current) => ({ ...current, title: "", body: "" }));
      load();
    } catch (error) {
      setNote({ ok: false, text: error.message });
    }
    setBusy(false);
  }

  return (
    <>
      <h1 className="text-3xl font-extrabold">Notifications</h1>
      <p className="mt-1 text-zinc-500">Who can get notifications, what went out, and messages to users</p>
      {!data.configured ? (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle size={16} className="shrink-0" /> Push keys (VAPID) aren&apos;t set on this server, so nothing can be sent yet.
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Users with notifications" value={reachableIds.size} hint={`${reach}% of users`} Icon={Bell} tone="bg-purple-500/15 text-purple-300" />
        <Tile label="Devices" value={data.devices.length} hint="Phones and computers" Icon={Smartphone} tone="bg-blue-500/15 text-blue-300" />
        <Tile label="Delivered today" value={sentToday} hint="Your messages" Icon={Send} tone="bg-emerald-500/15 text-emerald-300" />
        <Tile label="Messages sent" value={data.messages.length} hint="Last 40 shown below" Icon={Megaphone} tone="bg-amber-500/15 text-amber-300" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Section title="Send a message" sub="Shows up like any notification on their phone or computer">
          <form onSubmit={send} className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-zinc-400">To</p>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-950 p-1">
                {[[false, `Everyone (${reachableIds.size})`], [true, "Pick people"]].map(([pick, label]) => (
                  <button key={label} type="button" onClick={() => setPicked(pick ? new Set() : null)}
                    className={`h-9 rounded-lg text-xs font-semibold transition ${Boolean(picked) === pick ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {picked ? (
                <div className="mt-2 rounded-xl border border-zinc-800 p-2">
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email"
                    className="h-9 w-full rounded-lg bg-zinc-950 px-3 text-sm outline-none focus:ring-1 focus:ring-purple-500" />
                  <ul className="mt-1.5 space-y-0.5">
                    {matches.map((user) => (
                      <li key={user.id}>
                        <button type="button" onClick={() => togglePick(user.id)}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition ${picked.has(user.id) ? "bg-purple-500/15" : "hover:bg-zinc-800"}`}>
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-600 text-xs font-bold">{nameOf(user)[0].toUpperCase()}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{nameOf(user)}</span>
                            <span className="block truncate text-xs text-zinc-500">{user.email}</span>
                          </span>
                          {picked.has(user.id) ? <CheckCircle2 size={16} className="shrink-0 text-purple-300" /> : null}
                        </button>
                      </li>
                    ))}
                    {!matches.length ? <li className="px-2 py-2 text-xs text-zinc-500">No one with notifications on matches.</li> : null}
                  </ul>
                  {picked.size ? <p className="mt-1.5 px-2 text-xs text-purple-300">{picked.size} selected</p> : null}
                </div>
              ) : null}
            </div>

            <label className="block">
              <span className="mb-1.5 flex justify-between text-xs font-semibold text-zinc-400">Title <span className="tabular-nums">{form.title.length}/80</span></span>
              <input value={form.title} maxLength={80} onChange={(event) => { setForm((f) => ({ ...f, title: event.target.value })); setNote(null); }}
                placeholder="New jobs in Germany this week 🇩🇪"
                className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-purple-500" />
            </label>
            <label className="block">
              <span className="mb-1.5 flex justify-between text-xs font-semibold text-zinc-400">Message <span className="tabular-nums">{form.body.length}/240</span></span>
              <textarea value={form.body} maxLength={240} rows={3} onChange={(event) => { setForm((f) => ({ ...f, body: event.target.value })); setNote(null); }}
                placeholder="JobPilot found fresh matches for you. Tap to review them."
                className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-purple-500" />
            </label>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-zinc-400">Opens</p>
              <div className="flex flex-wrap gap-1.5">
                {OPENS.map(([url, label]) => (
                  <button key={url} type="button" onClick={() => setForm((f) => ({ ...f, url }))}
                    className={`h-8 rounded-full border px-3 text-xs font-semibold transition ${form.url === url ? "border-purple-500 bg-purple-500/15 text-purple-200" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview: Android/desktop, and iPhone (iOS adds "from JobChain" under the app name). */}
            <div className="space-y-2 rounded-2xl bg-zinc-950 p-3">
              {[
                ["Android & computer", "JobChain · now", form.title || "Title", form.body || "Your message"],
                ["iPhone", "now", form.title || "Title", form.body || "Your message", "from JobChain"],
              ].map(([label, meta, title, body, from]) => (
                <div key={label}>
                  <p className="mb-1 px-1 text-[11px] font-semibold text-zinc-500">{label}</p>
                  <div className="flex gap-3 rounded-xl bg-zinc-800/80 p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-600"><Bell size={16} /></span>
                    <span className="min-w-0 flex-1">
                      {!from ? <span className="block text-[11px] text-zinc-400">{meta}</span> : null}
                      <span className="block break-words text-sm font-semibold">{title}</span>
                      <span className="block break-words text-sm text-zinc-300">{body}</span>
                      {from ? <span className="block text-[11px] text-zinc-500">{from}</span> : null}
                    </span>
                  </div>
                </div>
              ))}
              {sample ? <p className="px-1 text-[11px] text-zinc-500">For example, {firstName(sample)} sees it like this.</p> : null}
            </div>

            <button type="submit" disabled={busy || !data.configured || !recipients.length}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-purple-600 text-sm font-semibold transition hover:bg-purple-500 disabled:opacity-50">
              <Send size={16} />
              {busy ? "Sending…" : picked
                ? picked.size === 1 ? `Send to ${nameOf(byId[[...picked][0]])}` : `Send to ${picked.size} people`
                : `Send to ${reachableIds.size} user${reachableIds.size === 1 ? "" : "s"}`}
            </button>
            {note ? (
              <p className={`flex items-center gap-1.5 text-sm ${note.ok ? "text-emerald-300" : "text-red-300"}`}>
                {note.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}{note.text}
              </p>
            ) : null}
          </form>
        </Section>

        <Section title="Automatic notifications" sub="Sent by JobChain without you">
          <ul className="space-y-3 text-sm">
            {[
              [Bell, "text-purple-300", "New Gmail access request", "You get one when someone asks to connect Gmail, on devices where you turned on request alerts."],
              [Users, "text-blue-300", "Who can receive them", "Only people who switched on JobChain notifications in Profile, on that device."],
            ].map(([Icon, tint, title, text]) => (
              <li key={title} className="flex gap-3">
                <Icon size={20} className={`mt-0.5 shrink-0 ${tint}`} />
                <span><span className="block font-semibold">{title}</span><span className="text-zinc-500">{text}</span></span>
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-xl bg-zinc-950 p-3 text-xs text-zinc-500">Devices that unsubscribe or expire are removed automatically the next time something is sent.</p>
        </Section>
      </div>

      <Section title="Recently sent" sub="Messages you sent" className="mt-4">
        {!data.messages.length ? <p className="text-sm text-zinc-500">Nothing sent yet.</p> : (
          <ul className="-my-2 divide-y divide-zinc-800">
            {data.messages.map((message) => {
              const to = message.user_ids.length === 1 ? nameOf(byId[message.user_ids[0]]) : `${message.recipient_count} people`;
              return (
                <li key={message.id} className="flex gap-3 py-3">
                  <Megaphone size={16} className="mt-0.5 shrink-0 text-purple-300" />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-medium">{message.title}</span>
                    {message.body ? <span className="block break-words text-xs text-zinc-500">{message.body}</span> : null}
                    <span className="mt-0.5 block text-xs text-zinc-600">To {to} · opens {message.url} · {ago(message.created_at)}</span>
                  </span>
                  <span className={`shrink-0 text-xs font-semibold tabular-nums ${message.device_count ? "text-emerald-300" : "text-zinc-500"}`}>
                    {message.device_count ? `${message.device_count} delivered` : "not delivered"}
                    {message.failed_count ? <span className="block text-red-300">{message.failed_count} failed</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Devices" sub="Where notifications are turned on" className="mt-4">
        {!data.devices.length ? <p className="text-sm text-zinc-500">No one has turned on notifications yet.</p> : (
          <ul className="-my-2 divide-y divide-zinc-800 text-sm">
            {data.devices.map((d, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-2.5">
                <span className="flex min-w-0 items-center gap-2">
                  <Smartphone size={16} className="shrink-0 text-zinc-500" />
                  <span className="truncate font-medium">{nameOf(byId[d.user_id])}</span>
                  <span className="text-zinc-500">· {device(d.user_agent)}</span>
                </span>
                <span className="text-xs text-zinc-500">added {ago(d.created_at)}{d.last_used_at ? ` · last sent ${ago(d.last_used_at)}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
