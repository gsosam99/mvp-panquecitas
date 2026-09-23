'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { DashboardRole } from '@/types';

type NavLink = { href: string; label: string };
type NavGroup = { label: string; items: NavLink[] };
type NavItem = NavLink | NavGroup;

// La carga de datos y la gestión de catálogo/personal viven en DIENN.
// Administrador se queda solo con el Dashboard de ejecución, para no
// alterar desde ese perfil la calidad de lo que se visualiza.
const NAV_ITEMS: Record<DashboardRole, NavItem[]> = {
  ADMIN: [{ href: '/dashboard', label: 'Dashboard' }],
  DIENN: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/sap-upload', label: 'Carga Radar' },
    // Cargas de Radar por categoría, agrupadas en un solo desplegable.
    {
      label: 'Acu. categorías',
      items: [
        { href: '/radar-3m', label: 'Radar 3 Meses' },
        { href: '/radar-margarina-referencia', label: 'Margarina — Referencia' },
        { href: '/radar-margarina-actual', label: 'Margarina — Actual' },
        { href: '/radar-mayonesa-referencia', label: 'Mayonesa — Referencia' },
        { href: '/radar-mayonesa-actual', label: 'Mayonesa — Actual' },
      ],
    },
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

const linkClass = (active: boolean) =>
  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
    active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
  }`;

function NavDropdown({ group, pathname }: { group: NavGroup; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = group.items.some((i) => i.href === pathname);

  // Cierra al hacer clic fuera o con Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`${linkClass(active)} inline-flex items-center gap-1`}
      >
        {group.label}
        <svg
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1 min-w-[14rem] rounded-md border border-slate-200 bg-white p-1 shadow-lg z-50"
        >
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={`block whitespace-nowrap ${linkClass(pathname === item.href)}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

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
              {items.map((item) =>
                'items' in item ? (
                  <NavDropdown key={item.label} group={item} pathname={pathname} />
                ) : (
                  <Link key={item.href} href={item.href} className={linkClass(pathname === item.href)}>
                    {item.label}
                  </Link>
                )
              )}
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
