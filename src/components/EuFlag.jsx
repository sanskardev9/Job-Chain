// The EU flag drawn as SVG: the 🇪🇺 emoji shows as letters or a blurry square on many devices.
export default function EuFlag({ className = "h-3.5 w-5" }) {
  const stars = Array.from({ length: 12 }, (_, i) => {
    const angle = (i * Math.PI) / 6;
    return [15 + 6.5 * Math.sin(angle), 10 - 6.5 * Math.cos(angle)];
  });
  return (
    <svg viewBox="0 0 30 20" className={`shrink-0 rounded-[2px] ${className}`} aria-hidden="true">
      <rect width="30" height="20" fill="#003399" />
      {stars.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.05" fill="#FFCC00" />
      ))}
    </svg>
  );
}
