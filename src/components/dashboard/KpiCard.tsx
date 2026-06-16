import { Card, CardContent } from "@/components/ui/card";

type ProductBadge = "pan" | "panquecitas" | "both";

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  highlight?: boolean;
  trend?: "up" | "down" | "neutral";
  product?: ProductBadge;
}

function ProductPill({ product }: { product: ProductBadge }) {
  if (product === "both") {
    return (
      <div className="flex gap-1 mb-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wide"
          style={{ background: "#f5c400", color: "#1a2744" }}>P·A·N</span>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wide text-white"
          style={{ background: "#1a65bd" }}>Panquecitas</span>
      </div>
    );
  }
  if (product === "pan") {
    return (
      <div className="mb-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wide"
          style={{ background: "#f5c400", color: "#1a2744" }}>P·A·N</span>
      </div>
    );
  }
  return (
    <div className="mb-2">
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wide text-white"
        style={{ background: "#1a65bd" }}>Panquecitas</span>
    </div>
  );
}

export function KpiCard({ title, value, subtitle, highlight, trend, product }: KpiCardProps) {
  return (
    <Card className={highlight ? "border-primary bg-primary text-primary-foreground shadow-md" : "shadow-sm"}>
      <CardContent className="pt-5">
        {product && <ProductPill product={product} />}
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
