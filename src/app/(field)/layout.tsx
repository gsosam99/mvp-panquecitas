import { requireFieldWorker } from "@/lib/session";
import { FieldTopBar } from "@/components/field/FieldTopBar";

export default async function FieldLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const worker = await requireFieldWorker();
  const displayName = `${worker.firstName} ${worker.lastName}`.trim();

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <FieldTopBar userName={displayName} />
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  );
}
