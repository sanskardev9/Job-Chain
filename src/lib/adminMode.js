"use client";

// Moving between JobChain and the admin panel. A purple panel sweeps diagonally across the screen,
// the route changes underneath it, then it sweeps away. Plain DOM so it survives the layout swap.
// The server still checks owner access on every admin request; this is only the transition.

const COVER = "polygon(0 0, 140% 0, 100% 100%, -40% 100%)";
const START = "polygon(0 0, 0 0, -40% 100%, -40% 100%)";
const LEAVE = "polygon(140% 0, 140% 0, 100% 100%, 100% 100%)";
const EASE = "cubic-bezier(0.65, 0, 0.35, 1)";

let busy = false;

export function switchMode(router, toAdmin) {
  const target = toAdmin ? "/admin" : "/home";
  const arrived = () => (toAdmin ? location.pathname.startsWith("/admin") : !location.pathname.startsWith("/admin"));
  if (busy) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !document.body.animate) return router.push(target);
  busy = true;
  router.prefetch?.(target);

  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = `position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;clip-path:${START};background:${
    toAdmin ? "linear-gradient(135deg,#a855f7 0%,#7e22ce 50%,#3b0764 100%)" : "linear-gradient(135deg,#c084fc 0%,#9333ea 55%,#4c1d95 100%)"
  }`;
  // Eyebrow, title, one quiet line underneath; each line rises in a beat after the last.
  const label = document.createElement("div");
  label.style.cssText = "display:flex;flex-direction:column;align-items:center;text-align:center;padding:0 24px;color:#fff;font-family:inherit;-webkit-font-smoothing:antialiased";
  const line = (text, css) => {
    const s = document.createElement("span");
    s.style.cssText = `display:block;opacity:0;${css}`;
    if (typeof text === "string") s.textContent = text;
    else s.append(...text);
    label.appendChild(s);
    return s;
  };
  const accent = (t) => Object.assign(document.createElement("span"), { textContent: t, style: "color:#e9d5ff" });
  const lines = [
    line(toAdmin ? "Switching to" : "Back to", "font-size:12px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.7)"),
    line(toAdmin ? ["Admin", accent(".")] : ["Job-", accent("Chain")], "margin-top:10px;font-size:clamp(40px,10vw,64px);line-height:1;font-weight:800;letter-spacing:-.04em"),
    line(toAdmin ? "Users · Gmail requests · Notifications" : "Your jobs, applications and JobPilot", "margin-top:14px;font-size:15px;font-weight:500;color:rgba(255,255,255,.75)"),
  ];
  el.appendChild(label);
  document.body.appendChild(el);

  const cover = el.animate([{ clipPath: START }, { clipPath: COVER }], { duration: 520, easing: EASE, fill: "forwards" });
  lines.forEach((s, i) =>
    s.animate(
      [{ opacity: 0, transform: "translateY(12px)", filter: "blur(4px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }],
      { duration: 380, delay: 220 + i * 90, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)", fill: "forwards" },
    ),
  );

  cover.finished.then(() => {
    router.push(target);
    const startedAt = Date.now();
    const wait = setInterval(() => {
      if (!arrived() && Date.now() - startedAt < 3000) return;
      clearInterval(wait);
      // Give the new page a moment to paint before revealing it.
      setTimeout(() => {
        label.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-8px)" }], { duration: 220, fill: "forwards" });
        el.animate([{ clipPath: COVER }, { clipPath: LEAVE }], { duration: 560, delay: 80, easing: EASE, fill: "forwards" })
          .finished.finally(() => {
            el.remove();
            busy = false;
          });
      }, 450);
    }, 40);
  });
}
