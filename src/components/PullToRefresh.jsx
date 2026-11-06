"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, RefreshCw } from "lucide-react";

const TRIGGER_DISTANCE = 76;
const MAX_DISTANCE = 112;

export default function PullToRefresh() {
  const start = useRef(null);
  const distanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const ignoreTarget = (target) =>
      target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true'], [data-no-pull-refresh]"));

    const onStart = (event) => {
      if (refreshingRef.current || window.scrollY > 0 || event.touches.length !== 1 || ignoreTarget(event.target)) {
        start.current = null;
        return;
      }
      start.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };

    const onMove = (event) => {
      if (!start.current || refreshingRef.current || event.touches.length !== 1) return;
      const dx = event.touches[0].clientX - start.current.x;
      const dy = event.touches[0].clientY - start.current.y;
      if (dy <= 0 || Math.abs(dx) > dy || window.scrollY > 0) {
        distanceRef.current = 0;
        setDistance(0);
        return;
      }
      if (dy > 10) event.preventDefault();
      const nextDistance = Math.min(MAX_DISTANCE, dy * 0.58);
      distanceRef.current = nextDistance;
      setDistance(nextDistance);
    };

    const onEnd = () => {
      if (!start.current) return;
      start.current = null;
      if (distanceRef.current >= TRIGGER_DISTANCE) {
        refreshingRef.current = true;
        setRefreshing(true);
        distanceRef.current = TRIGGER_DISTANCE;
        setDistance(TRIGGER_DISTANCE);
        window.setTimeout(() => window.location.reload(), 180);
      } else {
        distanceRef.current = 0;
        setDistance(0);
      }
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const ready = distance >= TRIGGER_DISTANCE;
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex justify-center overflow-hidden lg:hidden"
      style={{ height: `${distance}px`, opacity: distance ? 1 : 0 }}
    >
      <div className="mt-2 flex h-10 items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/95 px-4 text-xs font-semibold text-zinc-200 shadow-xl backdrop-blur">
        {refreshing ? (
          <RefreshCw size={15} className="animate-spin text-purple-300" />
        ) : (
          <ArrowDown size={15} className={`text-purple-300 transition-transform ${ready ? "rotate-180" : ""}`} />
        )}
        {refreshing ? "Refreshing…" : ready ? "Release to refresh" : "Pull to refresh"}
      </div>
    </div>
  );
}
