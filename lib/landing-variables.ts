// The variables a custom landing may interpolate.
//
// Split out of landing-vars.ts, which is `server-only` because it reads with
// the service-role client. This half is plain data and the dashboard needs it
// in the browser to build the AI brief and show the reference table.

/**
 * Keep this list in step with the resolver in lib/landing-vars.ts — a key here
 * with no value there renders as literal `{{braces}}` on someone's site.
 */
export const LANDING_VARIABLES: { key: string; describes: string }[] = [
  { key: 'nombre', describes: 'Nombre del restaurante' },
  { key: 'telefono', describes: 'Teléfono de WhatsApp, como se muestra' },
  { key: 'telefono_digitos', describes: 'Solo dígitos, para armar un enlace wa.me' },
  { key: 'whatsapp_url', describes: 'Enlace directo al chat de WhatsApp' },
  { key: 'email', describes: 'Correo de contacto' },
  { key: 'direccion', describes: 'Dirección' },
  { key: 'mapa_url', describes: 'Enlace a Google Maps' },
  { key: 'horario_hoy', describes: 'Horario de hoy, ej. "13:00 a 23:00"' },
  { key: 'horario_semana', describes: 'Horario completo, una línea por día' },
  { key: 'menu_url', describes: 'Enlace al menú digital' },
  { key: 'reservar_url', describes: 'Enlace que abre el formulario de reservación (Kuik lo oculta si las reservas están desactivadas)' },
  { key: 'home_url', describes: 'Enlace a la página principal del restaurante' },
  { key: 'instagram', describes: 'Enlace a Instagram' },
  { key: 'facebook', describes: 'Enlace a Facebook' },
  { key: 'sitio_web', describes: 'Sitio web propio' },
  { key: 'logo_url', describes: 'URL del logo' },
  { key: 'logo_horizontal_url', describes: 'URL del logo horizontal' },
  { key: 'portada_url', describes: 'URL de la imagen de portada' },
  { key: 'color_primario', describes: 'Color primario del tema' },
  { key: 'color_secundario', describes: 'Color secundario del tema' },
  { key: 'color_fondo', describes: 'Color de fondo del tema' },
  { key: 'color_texto', describes: 'Color de texto del tema' },
  { key: 'color_boton', describes: 'Color de los botones del tema' },
  { key: 'anio', describes: 'Año actual, útil para el pie de página' },
];

