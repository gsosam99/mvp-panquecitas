import { cookies } from "next/headers";
import { DASH_COOKIE, FIELD_COOKIE } from "@/lib/session";

export async function POST() {
  const store = await cookies();
  store.delete(DASH_COOKIE);
  store.delete(FIELD_COOKIE);
  return Response.json({ ok: true });
}
