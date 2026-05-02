"use client";

export default function Loader({ size = "md", className = "" }) {
  const dimensions =
    size === "sm"
      ? "h-4 w-4 border-2"
      : size === "lg"
        ? "h-10 w-10 border-[3px]"
        : "h-7 w-7 border-[3px]";

  return (
    <div
      className={`animate-spin rounded-full border-zinc-700 border-t-purple-500 ${dimensions} ${className}`}
      aria-label="Loading"
      role="status"
    />
  );
}
