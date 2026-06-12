import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Acceso Denegado</h1>
        <p className="text-slate-500 mb-6">No tienes permisos para acceder a esta sección.</p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
