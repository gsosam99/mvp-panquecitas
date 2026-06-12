import { Card, CardContent } from "@/components/ui/card";

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  highlight?: boolean;
  trend?: "up" | "down" | "neutral";
}

export function KpiCard({ title, value, subtitle, highlight, trend }: KpiCardProps) {
  return (
    <Card className={highlight ? "border-primary bg-primary text-primary-foreground shadow-md" : "shadow-sm"}>
      <CardContent className="pt-5">
        <p className={`text-xs font-semibold uppercase tracking-widest mb-1 ${highlight ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
          {title}
        </p>
        <div className="flex items-end gap-2">
          <p className={`text-3xl font-bold font-[var(--font-heading)] ${highlight ? "text-primary-foreground" : "text-foreground"}`}>
            {value}
          </p>
          {trend && (
            <span className={`text-sm mb-1 ${trend === "up" ? "text-emerald-400" : trend === "down" ? "text-rose-400" : "text-muted-foreground"}`}>
              {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
            </span>
          )}
        </div>
        {subtitle && (
          <p className={`text-xs mt-1 ${highlight ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
            {subtitle}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
