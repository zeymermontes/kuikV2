'use client';

import { useState } from 'react';
import { Copy, Check, Sparkles } from 'lucide-react';
import { LANDING_VARIABLES } from '@/lib/landing-variables';
import { Card } from '@/components/ui';

/**
 * The brief to hand an AI when generating a custom landing.
 *
 * The point of publishing it is that the ZIP should be written ONCE with
 * placeholders. A phone number, a schedule or a logo changing in Kuik is a
 * settings edit, not a reason to regenerate and re-upload a site.
 */
function buildPrompt(): string {
  const vars = LANDING_VARIABLES.map((v) => `  {{${v.key}}}  — ${v.describes}`).join('\n');

  return `Genera un sitio estático de una sola página para un restaurante.

ENTREGABLE
- Un .zip con index.html en la raíz. Puede incluir css/, js/ e imágenes.
- Todo autocontenido: nada de CDNs externos ni fuentes remotas que puedan fallar.
- Responsive, y pensado primero para celular: la mayoría llega por un QR.

VARIABLES — ESTO ES LO IMPORTANTE
No escribas datos del restaurante a mano. Usa estos marcadores y Kuik los
reemplaza al servir la página, con lo que el dueño tenga configurado en ese
momento. Así, si cambia su teléfono, el sitio se actualiza solo.

${vars}

Funcionan en el HTML, el CSS y el JS. Ejemplos:
  <h1>{{nombre}}</h1>
  <a href="{{whatsapp_url}}">Escríbenos</a>
  <a href="{{mapa_url}}">Cómo llegar</a>
  <p style="white-space:pre-line">{{horario_semana}}</p>
  <style>:root { --marca: {{color_primario}}; }</style>

Si una variable queda vacía (el dueño no la llenó), no debe romper el diseño:
esconde ese bloque con CSS o déjalo discreto.

ACCIONES DE KUIK
El sitio va dentro de la app, así que puede pedirle cosas. Dos formas:

1) Enlaces normales, sin nada de JavaScript. Usa target="_top":
   <a href="{{reservar_url}}" target="_top">Reservar mesa</a>
   <a href="{{menu_url}}" target="_top">Ver el menú</a>
   <a href="{{whatsapp_url}}" target="_blank">WhatsApp</a>

2) Sin salir de la página, con un atributo:
   <button data-kuik="reservar">Reservar mesa</button>
   <button data-kuik="whatsapp" data-text="Hola, quiero información">WhatsApp</button>
   <button data-kuik="menu">Ver el menú</button>

   O desde tu propio JS:
   Kuik.reservar();
   Kuik.whatsapp('Hola, quiero información');
   Kuik.menu();

   La opción 2 abre la reservación ENCIMA de la landing, sin navegar. Prefiérela
   para el botón principal; la opción 1 sirve de respaldo si el JS no carga.

RESERVACIONES — REGLA IMPORTANTE
El dueño puede desactivar las reservaciones desde su panel, y Kuik OCULTA
automáticamente todo CTA de reserva que use el contrato de arriba (los
data-kuik="reservar" y los enlaces a {{reservar_url}}). Por eso:
- Todo botón o enlace de reservar debe usar EXCLUSIVAMENTE esas dos formas;
  nunca armes un CTA de reserva de otra manera.
- Si una sección entera gira alrededor de reservar (un hero "Reserva tu mesa",
  un bloque con texto y botón), envuélvela en data-kuik-if="reservas":
    <section data-kuik-if="reservas"> … </section>
  Kuik la esconde completa cuando las reservas están apagadas.
- Diseña para que la página siga viéndose bien sin esos elementos (igual que
  con las variables vacías). Si tu CSS quiere reaccionar, Kuik marca
  html[data-kuik-reservas="off"] cuando están desactivadas.

QUÉ INCLUIR
- Portada con el nombre y un llamado claro a reservar (con el contrato de
  arriba, para que pueda ocultarse solo).
- Un vistazo del lugar (fotos si te las dan, si no un diseño que aguante sin ellas).
- Horarios, dirección con enlace a mapa, y contacto.
- Pie con {{anio}} y las redes que existan.

NO HAGAS
- No inventes platillos, precios ni promociones: el menú vive en {{menu_url}}.
- No pongas formularios propios de reservación; usa la acción de Kuik.
- No uses analytics ni scripts de terceros.`;
}

export function LandingAiPrompt() {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(buildPrompt());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard denied: the textarea below is still selectable by hand.
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Sparkles className="h-4 w-4" /> Instrucciones para generar el sitio con IA
          </p>
          <p className="text-xs text-neutral-500">
            Incluye las {LANDING_VARIABLES.length} variables, para no regenerar el ZIP cada
            vez que cambie un dato.
          </p>
        </div>
        <button
          onClick={copy}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>

      <button onClick={() => setOpen(!open)} className="mt-2 text-xs text-neutral-500 underline">
        {open ? 'Ocultar' : 'Ver las variables disponibles'}
      </button>

      {open && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <tbody>
              {LANDING_VARIABLES.map((v) => (
                <tr key={v.key} className="border-b border-neutral-100">
                  <td className="py-1 pr-3 font-mono text-neutral-800">{`{{${v.key}}}`}</td>
                  <td className="py-1 text-neutral-500">{v.describes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
