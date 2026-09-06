'use client';

import { useState } from 'react';
import { Check, ChefHat, ExternalLink, LayoutGrid, Smartphone, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DeviceFrame } from './DeviceFrame';

// The four screens a restaurant runs on, each one live. The menu is a real
// customer's; the other three are the public demos under /demo.

interface Tab {
  id: string;
  label: string;
  icon: typeof Smartphone;
  kind: 'phone' | 'tablet';
  src: string;
  open: string;
  openLabel: string;
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
}

export function ProductTour({ menuUrl, menuName }: { menuUrl: string | null; menuName: string | null }) {
  const tabs: Tab[] = [
    ...(menuUrl
      ? [
          {
            id: 'menu',
            label: 'Menú y pedidos',
            icon: Smartphone,
            kind: 'phone' as const,
            src: menuUrl,
            open: menuUrl,
            openLabel: `Abrir el menú de ${menuName ?? 'ejemplo'}`,
            eyebrow: 'Para tus clientes',
            title: 'El menú que recorren desde su celular',
            body: 'Se abre con un QR o un enlace, sin descargar nada. Cada restaurante lo viste con sus colores, tipografías y fotos.',
            bullets: [
              'Fotos, categorías y opciones por platillo',
              'Carrito con propina, envío y pago con tarjeta',
              'El pedido llega completo a tu WhatsApp',
            ],
          },
        ]
      : []),
    {
      id: 'pos',
      label: 'Punto de venta',
      icon: LayoutGrid,
      kind: 'tablet',
      src: '/demo/pos',
      open: '/demo/pos',
      openLabel: 'Abrir el POS en pantalla completa',
      eyebrow: 'Para la caja',
      title: 'Cobra rápido desde cualquier dispositivo',
      body: 'Una tablet, una computadora o el celular del mesero. Funciona sin internet y sincroniza al volver.',
      bullets: [
        'Mesas, cuentas abiertas y pagos divididos',
        'Comandas a cocina e impresión automática',
        'Corte de caja con arqueo y reporte Z',
      ],
    },
    {
      id: 'kds',
      label: 'Cocina',
      icon: ChefHat,
      kind: 'tablet',
      src: '/demo/kds',
      open: '/demo/kds',
      openLabel: 'Abrir la pantalla de cocina',
      eyebrow: 'Para la cocina',
      title: 'Cada comanda, al instante y por estación',
      body: 'La pantalla de cocina reemplaza los papelitos: cocina, barra y postres ven solo lo suyo, con el tiempo de cada ticket a la vista.',
      bullets: [
        'Colores según el tiempo de espera',
        'Marca platillos listos y recupera comandas',
        'Resumen del día por producto',
      ],
    },
    {
      id: 'host',
      label: 'Anfitrión',
      icon: Users,
      kind: 'tablet',
      src: '/demo/host',
      open: '/demo/host',
      openLabel: 'Abrir el puesto de anfitrión',
      eyebrow: 'Para la puerta',
      title: 'Reservaciones y mesas sin libreta',
      body: 'Tu plano real, con el estado de cada mesa. Las reservaciones entran solas desde el menú y el anfitrión sienta, mueve y libera con un toque.',
      bullets: [
        'Plano de mesas con estados en vivo',
        'Lista de espera y clientes sin reservación',
        'Reservaciones desde el menú, confirmadas por WhatsApp',
      ],
    },
  ];

  const [active, setActive] = useState(tabs[0].id);
  const [seen, setSeen] = useState<Set<string>>(() => new Set([tabs[0].id]));
  function pick(id: string) {
    setActive(id);
    setSeen((s) => (s.has(id) ? s : new Set(s).add(id)));
  }

  return (
    <div>
      <div role="tablist" aria-label="Pantallas de Kuik" className="flex flex-wrap justify-center gap-2">
        {tabs.map((tab) => {
          const on = tab.id === active;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={on}
              aria-controls={`tour-${tab.id}`}
              onClick={() => pick(tab.id)}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition',
                on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400',
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => {
        if (!seen.has(tab.id)) return null;
        const on = tab.id === active;
        const phone = tab.kind === 'phone';
        return (
          <div
            key={tab.id}
            id={`tour-${tab.id}`}
            role="tabpanel"
            hidden={!on}
            className={cn('mt-10 items-center gap-10 lg:mt-14 lg:gap-16', on && 'grid', phone ? 'lg:grid-cols-[1fr_minmax(0,300px)_1fr]' : 'lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]')}
          >
            <div className={cn(phone && 'lg:order-1')}>
              <p className="text-sm font-semibold text-amber-600">{tab.eyebrow}</p>
              <h3 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">{tab.title}</h3>
              <p className="mt-4 text-neutral-600">{tab.body}</p>
              <ul className="mt-6 space-y-3">
                {tab.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-3 text-sm text-neutral-800">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100">
                      <Check className="h-3 w-3 text-amber-700" strokeWidth={3} />
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
              <a
                href={tab.open}
                target="_blank"
                rel="noreferrer"
                className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-neutral-900 underline-offset-4 hover:underline"
              >
                {tab.openLabel} <ExternalLink className="h-4 w-4" />
              </a>
            </div>
            <div className={cn(phone ? 'mx-auto w-full max-w-[300px] lg:order-2' : '')}>
              <DeviceFrame src={tab.src} kind={tab.kind} title={tab.label} />
              <p className="mt-3 text-center text-xs text-neutral-500">Demo en vivo · tócalo, es la pantalla real con datos de ejemplo</p>
            </div>
            {phone && <div className="hidden lg:order-3 lg:block" aria-hidden />}
          </div>
        );
      })}
    </div>
  );
}
