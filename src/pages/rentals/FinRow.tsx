// Connect Pro Fleet — FinRow helper (extracted from RentalDetail).

export function FinRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`font-mono tabular ${valueClass ?? "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}
