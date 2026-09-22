import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, legalMetadata } from '@/components/landing/LegalPage';

// The "Data deletion instructions URL" Meta asks for in the app's settings.
// Reviewers check that a person can actually get their data removed, so every
// path here is one that exists in the product today.

const TITLE = 'Eliminación de datos';
const DESCRIPTION = 'Cómo borrar tus datos de Kuik: la cuenta de un restaurante, un número de WhatsApp conectado o tus datos como comensal.';

export const metadata: Metadata = legalMetadata('eliminacion-de-datos', TITLE, DESCRIPTION);

export default function Page() {
  return (
    <LegalPage
      slug="eliminacion-de-datos"
      title={TITLE}
      updated="2026-09-22"
      intro="Puedes pedir que eliminemos tus datos en cualquier momento. Aquí está el camino para cada caso; ninguno requiere llamar ni justificar el motivo."
      sections={[
        {
          title: 'Si administras un restaurante',
          body: (
            <>
              <p>Desde el panel en app.kuik.mx, con la cuenta del dueño:</p>
              <ul>
                <li><strong>Desconectar WhatsApp:</strong> en WhatsApp → Conexión, desconecta el número. El token de acceso que Meta nos dio se elimina en ese momento y Kuik deja de recibir mensajes de ese número.</li>
                <li><strong>Borrar el historial de chats:</strong> en la misma sección, con el número ya desconectado, «Borrar historial» elimina contactos, conversaciones, mensajes y archivos recibidos.</li>
                <li><strong>Cerrar la cuenta:</strong> escribe a contacto@kuik.mx desde el correo de tu cuenta pidiendo la baja. Cancelamos la suscripción, despublicamos el menú y eliminamos los datos del restaurante en un máximo de 30 días. Conservamos solo lo que la ley obliga (facturas emitidas).</li>
              </ul>
            </>
          ),
        },
        {
          title: 'Si eres comensal de un restaurante que usa Kuik',
          body: (
            <>
              <p>Los datos que Kuik tiene de ti los recibió por cuenta del restaurante (un pedido, una reservación o una conversación de WhatsApp). Tienes dos vías:</p>
              <ul>
                <li><strong>Con el restaurante:</strong> pídele que borre tu información; puede hacerlo desde su panel.</li>
                <li><strong>Con Kuik:</strong> escribe a <a href="mailto:contacto@kuik.mx" className="underline">contacto@kuik.mx</a> indicando el nombre del restaurante y el número de teléfono con el que interactuaste. Verificaremos que el número es tuyo (te enviamos un código por WhatsApp o SMS) y eliminaremos tus conversaciones, contactos, pedidos y reservaciones asociados en un máximo de 20 días hábiles.</li>
              </ul>
              <p>
                Si solo quieres que el asistente deje de escribirte, responde «baja» en la conversación de WhatsApp: se registra de
                inmediato y no volvemos a iniciar mensajes hacia ese número.
              </p>
            </>
          ),
        },
        {
          title: 'Datos que llegaron a través de Meta',
          body: (
            <p>
              Si conectaste tu cuenta de WhatsApp Business a Kuik y quitas la app «Kuik» desde la configuración de tu negocio en
              Meta (Configuración del negocio → Integraciones → Apps conectadas), Meta deja de enviarnos mensajes. Para que además
              eliminemos lo ya recibido, desconecta el número desde el panel de Kuik o escríbenos como se describe arriba.
            </p>
          ),
        },
        {
          title: 'Qué confirmamos',
          body: (
            <p>
              Cada solicitud recibe un correo de confirmación con la fecha en que se completó la eliminación. Los respaldos de la
              base de datos se depuran en un ciclo de 30 días, después del cual no queda copia alguna. Más detalles en el{' '}
              <Link href="/privacidad" className="underline">aviso de privacidad</Link>.
            </p>
          ),
        },
      ]}
    />
  );
}
