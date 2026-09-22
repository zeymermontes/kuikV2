import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, legalMetadata } from '@/components/landing/LegalPage';

// Meta's app review reads this page before granting the WhatsApp permissions
// used by Embedded Signup; the WhatsApp section below is written for that
// reader as much as for a restaurant owner.

const TITLE = 'Aviso de privacidad';
const DESCRIPTION =
  'Qué datos guarda Kuik, para qué los usa, con quién los comparte y cómo ejercer tus derechos, incluidos los datos que llegan por WhatsApp.';

export const metadata: Metadata = legalMetadata('privacidad', TITLE, DESCRIPTION);

export default function Page() {
  return (
    <LegalPage
      slug="privacidad"
      title={TITLE}
      updated="2026-09-22"
      intro="Kuik es una plataforma para restaurantes: menú digital, pedidos, reservaciones, punto de venta y un asistente por WhatsApp. Este aviso explica qué datos personales tratamos, con qué fin y qué puedes hacer al respecto. Aplica a kuik.mx, app.kuik.mx, los menús publicados en subdominios o dominios propios de cada restaurante, las apps Kuik y Kuik Terminal y el asistente de WhatsApp."
      sections={[
        {
          title: 'Responsable',
          body: (
            <>
              <p>
                El responsable del tratamiento es Kuik (en adelante «Kuik» o «nosotros»), con domicilio en México. Para cualquier tema
                relacionado con este aviso escribe a <a href="mailto:contacto@kuik.mx" className="underline">contacto@kuik.mx</a>.
              </p>
              <p>
                Cuando un restaurante usa Kuik para atender a sus comensales, el restaurante decide qué datos pide y para qué; Kuik
                los trata por cuenta del restaurante, como encargado. Cuando los datos son de la persona que administra el restaurante
                (su cuenta, su facturación), Kuik es el responsable.
              </p>
            </>
          ),
        },
        {
          title: 'Datos que tratamos',
          body: (
            <>
              <p><strong>De quien administra un restaurante:</strong></p>
              <ul>
                <li>Nombre, correo electrónico y contraseña (cifrada) de la cuenta.</li>
                <li>Datos del negocio: nombre, dirección, teléfono, horarios, logotipo, menú y precios.</li>
                <li>Datos de facturación y pago de la suscripción, tratados por el procesador de pagos; Kuik no guarda números de tarjeta.</li>
                <li>Registro de actividad en el panel (quién cambió qué y cuándo), para seguridad y soporte.</li>
              </ul>
              <p><strong>De los comensales de un restaurante:</strong></p>
              <ul>
                <li>Al pedir o reservar: nombre, teléfono, correo si lo dan, mesa, pedido, fecha y hora, notas.</li>
                <li>Al escribir al restaurante por WhatsApp: número de teléfono, nombre de perfil, los mensajes de esa conversación y los archivos que envíen (imágenes, notas de voz), para que el restaurante y su asistente puedan responder.</li>
                <li>Si el restaurante activa un programa de lealtad: visitas y puntos asociados al teléfono.</li>
              </ul>
              <p><strong>Datos técnicos:</strong> dirección IP, tipo de navegador o dispositivo y páginas visitadas, usados para seguridad, límites de tráfico y estadísticas agregadas.</p>
            </>
          ),
        },
        {
          title: 'Para qué los usamos',
          body: (
            <ul>
              <li>Prestar el servicio: mostrar el menú, recibir pedidos y reservaciones, operar el punto de venta y la cocina.</li>
              <li>Operar el asistente de WhatsApp: recibir los mensajes de los comensales, responderlos según los flujos que configuró el restaurante y avisar al personal cuando alguien pide hablar con una persona.</li>
              <li>Enviar notificaciones que el restaurante configuró: confirmación o recordatorio de una reservación, estado de un pedido, invitaciones al personal.</li>
              <li>Cobrar la suscripción y emitir facturas.</li>
              <li>Seguridad: detectar abuso, proteger las cuentas y cumplir obligaciones legales.</li>
              <li>Mejorar el producto con estadísticas agregadas que no identifican a personas.</li>
            </ul>
          ),
        },
        {
          title: 'WhatsApp y la plataforma de Meta',
          body: (
            <>
              <p>
                Un restaurante puede conectar su número de WhatsApp a Kuik a través de la API oficial de WhatsApp Business (Meta). Al
                hacerlo, Meta comparte con Kuik el identificador de la cuenta de WhatsApp Business, el identificador del número, el
                nombre verificado y un token de acceso, y Kuik recibe por webhook los mensajes que los comensales envían a ese número.
              </p>
              <ul>
                <li>Usamos esos datos únicamente para que el restaurante reciba y conteste mensajes desde Kuik y para que su asistente automático funcione. No los usamos para publicidad ni los vendemos.</li>
                <li>Los tokens de acceso se guardan cifrados y solo el servidor de Kuik puede usarlos. Al desconectar el número desde el panel, el token se elimina y Kuik deja de recibir mensajes de ese número.</li>
                <li>Si el restaurante activa la inteligencia artificial del asistente, el texto de la conversación se envía al proveedor de modelos que el restaurante eligió para generar la respuesta; no se usa para entrenar modelos por parte de Kuik.</li>
                <li>El uso de la plataforma de Meta se rige además por las <a href="https://www.whatsapp.com/legal/business-terms" className="underline" target="_blank" rel="noreferrer">condiciones de WhatsApp Business</a> y la <a href="https://developers.facebook.com/terms/" className="underline" target="_blank" rel="noreferrer">política de la plataforma de Meta</a>.</li>
              </ul>
              <p>
                Un comensal puede pedir en cualquier momento que el asistente deje de escribirle respondiendo «baja» o «stop»; Kuik
                registra esa preferencia y no vuelve a iniciar mensajes hacia ese número.
              </p>
            </>
          ),
        },
        {
          title: 'Con quién los compartimos',
          body: (
            <>
              <p>No vendemos datos personales. Los compartimos solo con proveedores que necesitamos para operar, bajo contrato y solo para los fines descritos:</p>
              <ul>
                <li>Alojamiento de la aplicación y la base de datos (Render, Supabase), con servidores en Estados Unidos.</li>
                <li>Red de entrega y protección contra ataques (Cloudflare).</li>
                <li>Meta Platforms, para la mensajería de WhatsApp.</li>
                <li>Proveedores de modelos de inteligencia artificial, únicamente cuando el restaurante activa esa función.</li>
                <li>Procesadores de pago (Stripe, Mercado Pago) para la suscripción y, si el restaurante lo activa, los pagos de sus comensales.</li>
                <li>Envío de correo transaccional (Resend) y de notificaciones push.</li>
              </ul>
              <p>También podemos compartir datos cuando una ley o una autoridad competente lo exija.</p>
            </>
          ),
        },
        {
          title: 'Cuánto tiempo los conservamos',
          body: (
            <ul>
              <li>Los datos de la cuenta y del restaurante, mientras la cuenta exista. Al cerrarla se eliminan en un plazo máximo de 30 días, salvo lo que la ley obligue a conservar (facturas).</li>
              <li>Las conversaciones de WhatsApp, mientras el restaurante las mantenga; el restaurante puede borrar todo el historial desde su panel. Las corridas del asistente se depuran a los 90 días.</li>
              <li>Los registros técnicos y de seguridad, hasta 12 meses.</li>
            </ul>
          ),
        },
        {
          title: 'Tus derechos',
          body: (
            <>
              <p>
                Puedes acceder, rectificar, cancelar u oponerte al tratamiento de tus datos (derechos ARCO), así como revocar tu
                consentimiento, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.
              </p>
              <p>
                Escríbenos a <a href="mailto:contacto@kuik.mx" className="underline">contacto@kuik.mx</a> desde el correo de tu cuenta, o desde
                cualquier correo indicando el restaurante y el teléfono con el que interactuaste. Respondemos en un máximo de 20 días
                hábiles. Las instrucciones para eliminar tus datos están en{' '}
                <Link href="/eliminacion-de-datos" className="underline">kuik.mx/eliminacion-de-datos</Link>.
              </p>
              <p>Si eres comensal, también puedes dirigirte directamente al restaurante, que es quien decide sobre tus datos.</p>
            </>
          ),
        },
        {
          title: 'Cookies',
          body: (
            <p>
              Usamos únicamente cookies necesarias: la sesión de tu cuenta en el panel y tu preferencia de idioma. Los menús públicos
              no usan cookies de seguimiento. Si un restaurante configura su propio píxel de Meta en su menú, ese píxel se rige por
              la política de privacidad del restaurante y de Meta.
            </p>
          ),
        },
        {
          title: 'Seguridad',
          body: (
            <p>
              Todo el tráfico va cifrado (HTTPS). Las contraseñas se guardan con hash, los tokens y llaves de terceros se guardan
              cifrados con una llave que no vive en la base de datos, y el acceso a los datos de cada restaurante está aislado por
              reglas a nivel de base de datos.
            </p>
          ),
        },
        {
          title: 'Cambios a este aviso',
          body: (
            <p>
              Si cambiamos este aviso de forma relevante, lo publicaremos aquí con la nueva fecha y, si afecta a tu cuenta, te
              avisaremos por correo o en el panel.
            </p>
          ),
        },
      ]}
    />
  );
}
