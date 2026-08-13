// Weekly capacity heatmap — sequential single-hue (teal) by occupancy %.

export function CapacityHeatmap({
  blocks,
  columns,
}: {
  blocks: string[]; // row labels (time bands)
  columns: { label: string; cells: number[] }[]; // one per weekday; cells indexed by block
}) {
  function bg(v: number) {
    // 0% -> surface-2, 100% -> primary
    return `color-mix(in srgb, var(--primary) ${Math.round(v)}%, var(--surface-2))`;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-center">
        <thead>
          <tr>
            <th className="w-14"></th>
            {columns.map((c) => (
              <th key={c.label} className="pb-1 text-xs font-medium text-muted-foreground">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {blocks.map((block, row) => (
            <tr key={block}>
              <td className="pr-2 text-right text-[11px] font-medium text-subtle-foreground">{block}</td>
              {columns.map((c) => {
                const v = c.cells[row] ?? 0;
                return (
                  <td key={c.label}>
                    <div
                      className="flex h-9 items-center justify-center rounded-md text-[12px] font-semibold tabular"
                      style={{ backgroundColor: bg(v), color: v > 55 ? "var(--primary-foreground)" : "var(--muted-foreground)" }}
                      title={`${c.label} ${block}: ${v}%`}
                    >
                      {v}%
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
        <span>Menos ocupado</span>
        <div className="h-2.5 w-24 rounded-full" style={{ background: "linear-gradient(90deg, var(--surface-2), var(--primary))" }} />
        <span>Mais ocupado</span>
      </div>
    </div>
  );
}
