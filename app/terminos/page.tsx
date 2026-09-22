import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, legalMetadata } from '@/components/landing/LegalPage';

const TITLE = 'Términos del servicio';
const DESCRIPTION = 'Las condiciones bajo las que un restaurante usa Kuik: cuenta, suscripción, WhatsApp, responsabilidades y cancelación.';

export const metadata: Metadata = legalMetadata('terminos', TITLE, DESCRIPTION);

export default function Page() {
  return (
    <LegalPage
      slug="terminos"
      title={TITLE}
      updated="2026-09-22"
      intro="Al crear una cuenta en Kuik aceptas estos términos. Están escritos para leerse completos en unos minutos; si algo no queda claro, escríbenos a contacto@kuik.mx antes de contratar."
      sections={[
        {
          title: 'El servicio',
          body: (
            <p>
              Kuik ofrece a restaurantes un menú digital, recepción de pedidos y reservaciones, punto de venta, pantalla de cocina,
              anfitrión, programa de lealtad y un asistente por WhatsApp, con un panel de administración en app.kuik.mx y apps para
              dispositivos móviles y de escritorio. Las funciones disponibles dependen del plan contratado.
            </p>
          ),
        },
        {
          title: 'Tu cuenta',
          body: (
            <ul>
              <li>Debes ser mayor de edad y tener facultades para actuar en nombre del restaurante.</li>
              <li>Eres responsable de tu contraseña y de lo que se haga con tu cuenta. Puedes invitar personal con distintos roles; lo que hagan es responsabilidad del restaurante.</li>
              <li>La información del restaurante (nombre, dirección, menú, precios, alérgenos) debe ser veraz y mantenerse actualizada.</li>
            </ul>
          ),
        },
        {
          title: 'Suscripción y pagos',
          body: (
            <ul>
              <li>Los planes y precios vigentes se muestran en kuik.mx. Los cobros son por adelantado, por mes o por año, a través de nuestro procesador de pagos.</li>
              <li>Puedes cambiar de plan o cancelar en cualquier momento desde el panel; la cancelación surte efecto al terminar el periodo pagado y no se hacen reembolsos por periodos parciales.</li>
              <li>Si un pago falla, avisamos y damos un plazo razonable antes de limitar las funciones de pago; el menú publicado sigue visible.</li>
              <li>Los precios pueden cambiar con aviso de al menos 30 días; el cambio aplica en la siguiente renovación.</li>
            </ul>
          ),
        },
        {
          title: 'WhatsApp',
          body: (
            <>
              <p>
                Si conectas un número de WhatsApp a través de la API oficial de WhatsApp Business, aceptas además las condiciones de
                WhatsApp Business y las políticas de mensajería de Meta, y te comprometes a:
              </p>
              <ul>
                <li>Escribir solo a personas que te contactaron o dieron su consentimiento, y respetar de inmediato a quien pida no recibir más mensajes.</li>
                <li>No usar el asistente para spam, promociones no solicitadas ni contenido prohibido por Meta.</li>
                <li>Asumir los cargos que Meta cobre por las conversaciones iniciadas por tu negocio; Kuik no los factura ni los controla.</li>
              </ul>
              <p>
                Kuik ofrece también una vinculación por código QR, similar a WhatsApp Web, que usa un cliente no oficial. Esa opción
                la eliges bajo tu propio riesgo: WhatsApp no la permite en sus términos y puede suspender el número. Kuik lo advierte
                antes de vincular y no responde por esa suspensión.
              </p>
            </>
          ),
        },
        {
          title: 'Datos y privacidad',
          body: (
            <p>
              Los datos de tus comensales son tuyos; Kuik los trata por tu cuenta conforme al{' '}
              <Link href="/privacidad" className="underline">aviso de privacidad</Link>. Eres responsable de contar con tu propio aviso
              de privacidad frente a tus comensales y de responder sus solicitudes; Kuik te apoya con las herramientas del panel
              (borrar historial, desconectar el número).
            </p>
          ),
        },
        {
          title: 'Uso aceptable',
          body: (
            <ul>
              <li>No uses Kuik para actividades ilegales, para suplantar a otro negocio ni para publicar contenido que infrinja derechos de terceros.</li>
              <li>No intentes acceder a datos de otros restaurantes, sobrecargar el servicio ni eludir sus límites.</li>
              <li>Podemos suspender una cuenta que incumpla estos términos, avisando salvo que la urgencia lo impida.</li>
            </ul>
          ),
        },
        {
          title: 'Disponibilidad y soporte',
          body: (
            <p>
              Trabajamos para que Kuik esté disponible de forma continua, pero no garantizamos un servicio ininterrumpido: puede haber
              mantenimientos, fallas de proveedores (alojamiento, Meta, procesadores de pago) o causas fuera de nuestro control. El
              soporte se atiende por correo en contacto@kuik.mx en horario hábil de México.
            </p>
          ),
        },
        {
          title: 'Propiedad intelectual',
          body: (
            <p>
              Kuik, su software, marca y diseño son propiedad de Kuik. Tú conservas todos los derechos sobre tu marca, tu menú, tus
              fotos y tus textos; nos das únicamente la licencia necesaria para mostrarlos en tu menú y en las funciones que
              actives. Si te sumas a la vitrina de ejemplos de kuik.mx, puedes pedir salir de ella cuando quieras.
            </p>
          ),
        },
        {
          title: 'Responsabilidad',
          body: (
            <p>
              Kuik se presta «tal cual». En la medida que la ley lo permita, nuestra responsabilidad total frente a ti se limita al
              monto que pagaste por el servicio en los 12 meses anteriores al hecho que la origine, y no respondemos por pérdidas
              indirectas (ventas no realizadas, daño reputacional). Nada en estos términos limita derechos que la ley te otorgue
              como consumidor.
            </p>
          ),
        },
        {
          title: 'Terminación',
          body: (
            <p>
              Puedes cerrar tu cuenta desde el panel o escribiéndonos. Al cerrarla, el menú deja de publicarse, los números de
              WhatsApp se desconectan y los datos se eliminan conforme al aviso de privacidad. Podemos terminar el servicio con 30
              días de aviso, devolviendo la parte proporcional de un periodo pagado por adelantado.
            </p>
          ),
        },
        {
          title: 'Ley aplicable',
          body: (
            <p>
              Estos términos se rigen por las leyes de los Estados Unidos Mexicanos. Para cualquier controversia, las partes se
              someten a los tribunales competentes de la ciudad donde Kuik tiene su domicilio, sin perjuicio de los derechos que
              como consumidor te correspondan ante la Profeco.
            </p>
          ),
        },
      ]}
    />
  );
}
