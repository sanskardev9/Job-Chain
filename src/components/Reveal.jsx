"use client";

import { useEffect, useRef, useState } from "react";

// Fades and slides its content in the first time it scrolls into view. `delay` (ms) staggers lists;
// `from` picks the direction. Shown at once for people who prefer reduced motion.
export default function Reveal({ children, delay = 0, from = "up", className = "", as: Tag = "div" }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      setShown(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const hidden = { up: "translate-y-8", left: "-translate-x-10", right: "translate-x-10", scale: "scale-95" }[from];
  return (
    <Tag
      ref={ref}
      data-shown={shown ? "true" : "false"}
      style={{ transitionDelay: shown ? `${delay}ms` : "0ms", "--reveal-delay": `${delay}ms` }}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none ${
        shown ? "translate-x-0 translate-y-0 scale-100 opacity-100" : `opacity-0 ${hidden}`
      } ${className}`}
    >
      {children}
    </Tag>
  );
}

// Counts up to `value` once visible (e.g. 0 → 178). Non-numbers are shown as they are.
export function CountUp({ value, duration = 1200 }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(typeof value === "number" ? 0 : value);

  useEffect(() => {
    if (typeof value !== "number") {
      setShown(value);
      return undefined;
    }
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return undefined;
    }
    let frame;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min((now - start) / duration, 1);
        setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, duration]);

  return <span ref={ref}>{typeof shown === "number" ? shown.toLocaleString() : shown}</span>;
}
