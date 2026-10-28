"use client";

// Page loads (size "lg") show the "#JobFollows" wordmark with bouncing dots; smaller sizes, used inside
// buttons and cards, stay a compact spinner.
export default function Loader({ size = "md", className = "" }) {
  if (size === "lg") {
    return (
      <div role="status" aria-label="Loading" className={`flex items-end gap-1 text-2xl font-extrabold tracking-tight ${className}`}>
        <span className="text-white">
          <span className="text-purple-400">#</span>JobFollows
        </span>
        <span className="mb-1.5 flex gap-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-400" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </span>
      </div>
    );
  }

  const dimensions = size === "sm" ? "h-4 w-4 border-2" : "h-7 w-7 border-[3px]";
  return (
    <div
      className={`animate-spin rounded-full border-zinc-700 border-t-purple-500 ${dimensions} ${className}`}
      aria-label="Loading"
      role="status"
    />
  );
}
