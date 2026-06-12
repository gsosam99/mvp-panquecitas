import { requireAnyRole } from "@/lib/auth";

export default async function FieldLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAnyRole(["MERCADERISTA", "PROMOTORA"]);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {children}
    </div>
  );
}
