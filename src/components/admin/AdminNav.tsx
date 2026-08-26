'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { DashboardRole } from '@/types';

// La carga de datos y la gestión de catálogo/personal viven en DIENN.
// Administrador se queda solo con el Dashboard de ejecución, para no
// alterar desde ese perfil la calidad de lo que se visualiza.
const NAV_ITEMS: Record<DashboardRole, { href: string; label: string }[]> = {
  ADMIN: [{ href: '/dashboard', label: 'Dashboard' }],
  DIENN: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/sap-upload', label: 'Carga Radar' },
    { href: '/radar-3m', label: 'Radar 3 Meses' },
    { href: '/radar-margarina-referencia', label: 'Margarina — Referencia' },
    { href: '/radar-margarina-actual', label: 'Margarina — Actual' },
    { href: '/radar-mayonesa-referencia', label: 'Mayonesa — Referencia' },
    { href: '/radar-mayonesa-actual', label: 'Mayonesa — Actual' },
    { href: '/pedidos-pendientes', label: 'Pedidos y Facturado' },
    { href: '/motivos-no-venta', label: 'Motivos de No Venta' },
    { href: '/despachos', label: 'Despachos SAP' },
    { href: '/sell-out-cadenas', label: 'Sell-Out Cadenas' },
    { href: '/cartera', label: 'Cartera de Clientes' },
    { href: '/resumen-piloto', label: 'Resumen del Piloto' },
    { href: '/modelo-atencion', label: 'Plan de Visita' },
    { href: '/products', label: 'Productos' },
    { href: '/personal', label: 'Personal de Campo' },
  ],
};

export function AdminNav({ role }: { role: DashboardRole }) {
  const pathname = usePathname();
  const router = useRouter();
  const items = NAV_ITEMS[role];

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
    toast.success('Sesión cerrada');
  }

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 print:hidden">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-1">
            <span className="font-bold text-primary mr-4 text-lg">
              Panquecitas
            </span>
            <nav className="flex items-center gap-1">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    pathname === item.href
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Cerrar sesión
          </Button>
        </div>
      </div>
    </header>
  );
}
