import Link from 'next/link';
import { Logo } from './Logo';

const LINKS = [
  ['/#producto', 'Producto'],
  ['/#funciones', 'Funciones'],
  ['/#ejemplos', 'Ejemplos'],
  ['/#precios', 'Precios'],
  ['/#faq', 'Preguntas'],
] as const;

export function Nav({ loginLabel, ctaLabel }: { loginLabel: string; ctaLabel: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200/70 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Kuik, inicio">
          <Logo />
          <span className="text-lg font-bold tracking-tight">Kuik</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-neutral-600 md:flex" aria-label="Secciones">
          {LINKS.map(([href, label]) => (
            <a key={href} href={href} className="transition hover:text-neutral-900">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2 text-sm">
          <Link href="/login" className="hidden rounded-full px-4 py-2 font-medium text-neutral-700 hover:bg-neutral-100 sm:block">
            {loginLabel}
          </Link>
          <Link href="/signup" className="rounded-full bg-neutral-900 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-neutral-700">
            {ctaLabel}
          </Link>
        </div>
      </div>
    </header>
  );
}
