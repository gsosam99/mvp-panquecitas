import { requireAnyRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { FieldTopBar } from '@/components/field/FieldTopBar';

export default async function FieldLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAnyRole(['MERCADERISTA', 'PROMOTORA']);
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('full_name')
    .eq('id', user?.id)
    .single();

  const displayName = (profile?.full_name as string | null) ?? user?.email ?? '';

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <FieldTopBar userName={displayName} />
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  );
}
