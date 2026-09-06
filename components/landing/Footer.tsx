import Link from 'next/link';
import { Logo } from './Logo';
import { FEATURE_PAGES } from '@/lib/landing/features';

/** The marketing site's footer. The feature pages are linked from every page so crawlers find them all from any entry point. */
export function Footer({ loginLabel, ctaLabel }: { loginLabel: string; ctaLabel: string }) {
  return (
    <footer className="border-t border-neutral-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/" className="flex items-center gap-2.5" aria-label="Kuik, inicio">
            <Logo className="h-7 w-7" />
            <span className="font-bold tracking-tight">Kuik</span>
          </Link>
          <p className="mt-3 max-w-xs text-sm text-neutral-500">Menú digital, pedidos, punto de venta y reservaciones para restaurantes en México.</p>
        </div>
        <div className="grid grid-cols-2 gap-10 text-sm sm:grid-cols-3">
          <div>
            <p className="font-semibold">Producto</p>
            <ul className="mt-3 space-y-2 text-neutral-500">
              {FEATURE_PAGES.map((f) => (
                <li key={f.slug}>
                  <Link href={`/${f.slug}`} className="hover:text-neutral-900">{f.name}</Link>
                </li>
              ))}
              <li><Link href="/#precios" className="hover:text-neutral-900">Precios</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold">Demos en vivo</p>
            <ul className="mt-3 space-y-2 text-neutral-500">
              <li><a href="/demo/pos" target="_blank" rel="noreferrer" className="hover:text-neutral-900">Punto de venta</a></li>
              <li><a href="/demo/kds" target="_blank" rel="noreferrer" className="hover:text-neutral-900">Cocina</a></li>
              <li><a href="/demo/host" target="_blank" rel="noreferrer" className="hover:text-neutral-900">Anfitrión</a></li>
              <li><Link href="/#ejemplos" className="hover:text-neutral-900">Menús reales</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold">Cuenta</p>
            <ul className="mt-3 space-y-2 text-neutral-500">
              <li><Link href="/login" className="hover:text-neutral-900">{loginLabel}</Link></li>
              <li><Link href="/signup" className="hover:text-neutral-900">{ctaLabel}</Link></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-neutral-100 py-6 text-center text-xs text-neutral-400">© {new Date().getFullYear()} Kuik · Hecho en México</div>
    </footer>
  );
}
