// "2026-10-12" -> "12 Oct" (adds the year when it is not this year).
export function shortDate(iso) {
  if (!iso) return null;
  const date = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

// "Posted 12 Oct · Apply by 30 Oct", with overdue deadlines called out.
export function jobDates(posted, deadline) {
  const parts = [];
  if (posted) parts.push(`Posted ${shortDate(posted)}`);
  if (deadline) {
    const due = new Date(`${String(deadline).slice(0, 10)}T23:59:59`);
    parts.push(due < new Date() ? `Closed ${shortDate(deadline)}` : `Apply by ${shortDate(deadline)}`);
  }
  return parts.join(" · ");
}
