export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-6 w-48 rounded-md bg-muted" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows, order never changes
          <div key={i} className="h-20 w-full rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}
