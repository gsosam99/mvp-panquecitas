import { NextResponse, type NextRequest } from "next/server";

// El MVP ya no usa Supabase Auth: el acceso a dashboards se controla con una
// cookie de sesión firmada (ver src/lib/session.ts) y los flujos de campo con
// una cookie de identidad. La verificación se hace en cada Server Component
// vía requireDashboard()/requireFieldWorker(), no en el proxy.
export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
