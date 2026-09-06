// The marketing site's feature pages: one per thing a restaurant owner types
// into Google ("menú digital QR", "punto de venta para restaurante", ...).
// Nobody searches for "Kuik" yet; these pages rank for the need and lead to
// the brand. Content lives here as data so the page template, the sitemap
// and the footer read the same list.

export type FeatureIcon =
  | 'qr' | 'smartphone' | 'palette' | 'whatsapp' | 'creditCard' | 'globe' | 'barChart'
  | 'monitor' | 'chefHat' | 'printer' | 'wifiOff' | 'users' | 'wallet'
  | 'calendar' | 'layout' | 'bell' | 'clock' | 'listChecks' | 'bot' | 'heart' | 'building';

export interface FeatureBenefit {
  icon: FeatureIcon;
  title: string;
  text: string;
}

export interface FeaturePage {
  slug: string;
  /** Short name for menus, breadcrumbs and cross-links. */
  name: string;
  /** The <title>; under 60 characters, keyword first, brand last. */
  metaTitle: string;
  /** The meta description; under 158 characters. */
  description: string;
  eyebrow: string;
  h1: string;
  intro: string[];
  /** Which live demo frames the hero shows. 'menu' = the first showcase restaurant's real menu. */
  demo: { tablet?: string; phone?: 'menu' | 'reservation' | string; caption: string };
  benefits: FeatureBenefit[];
  audience: { title: string; items: string[] };
  steps: [string, string][];
  faq: { q: string; a: string }[];
  related: string[];
}

export const FEATURE_PAGES: FeaturePage[] = [
  {
    slug: 'menu-digital',
    name: 'Menú digital',
    metaTitle: 'Menú digital QR para restaurantes | Kuik',
    description:
      'Crea el menú digital de tu restaurante con código QR: fotos, precios, opciones y pedidos por WhatsApp. Diseño a tu medida, listo hoy y con un mes gratis.',
    eyebrow: 'Menú digital con QR',
    h1: 'El menú digital de tu restaurante, con código QR y pedidos incluidos',
    intro: [
      'Un menú digital es la carta de tu restaurante en una página web que el comensal abre al escanear un código QR en la mesa o al tocar un enlace en Instagram, Google Maps o WhatsApp. Se actualiza al instante: cambias un precio o agotas un platillo y todas las mesas lo ven en ese momento, sin reimprimir nada.',
      'Con Kuik el menú no es solo para leer. El comensal arma su pedido, elige opciones y extras, lo envía a tu WhatsApp o paga con tarjeta desde su celular, y puede reservar una mesa desde la misma página. Tu menú vive en tunombre.kuik.mx o en tu propio dominio.',
    ],
    demo: { phone: 'menu', caption: 'Este es un menú real de un restaurante que usa Kuik. Tócalo, navega y arma un pedido.' },
    benefits: [
      { icon: 'qr', title: 'QR por mesa', text: 'Genera e imprime códigos QR por mesa o para el mostrador. Cada uno abre el menú con la mesa ya identificada, así el pedido llega con su número.' },
      { icon: 'palette', title: 'Diseño a tu medida', text: 'Colores, tipografías, fondo, logo, fotos de portada y estilo de tarjetas. Plantillas listas para empezar y control fino para que se vea como tu marca, no como una app genérica.' },
      { icon: 'smartphone', title: 'Fotos, opciones y extras', text: 'Cada platillo con foto, descripción, calorías, etiquetas (vegano, picante, sin gluten), tamaños, complementos y modificadores. El comensal decide sin preguntarle al mesero.' },
      { icon: 'whatsapp', title: 'Pedidos por WhatsApp', text: 'El pedido llega ordenado a tu WhatsApp con mesa, nombre, notas y total. Sin comisiones por pedido y sin cambiar la forma en que ya atiendes.' },
      { icon: 'creditCard', title: 'Pago con tarjeta', text: 'Activa el pago en línea y el comensal paga desde su celular antes de que el pedido llegue a cocina. El dinero se deposita en tu cuenta bancaria.' },
      { icon: 'globe', title: 'Tu dominio y varias sucursales', text: 'Publica en tunombre.kuik.mx o conecta tu propio dominio. Cada sucursal puede tener su WhatsApp, horario y dirección, con el mismo menú o uno propio.' },
    ],
    audience: {
      title: 'Para qué tipo de negocio funciona',
      items: [
        'Restaurantes con servicio a mesa que quieren dejar de imprimir cartas.',
        'Cafeterías, taquerías y fondas que reciben pedidos por WhatsApp todo el día.',
        'Dark kitchens y negocios solo a domicilio que necesitan una carta en línea con pedidos.',
        'Bares y antros con carta de bebidas que cambia por temporada.',
        'Food trucks y puestos que cambian de ubicación y necesitan un enlace fijo.',
      ],
    },
    steps: [
      ['Crea tu cuenta', 'Elige el nombre de tu menú y tu número de WhatsApp. Un minuto, sin tarjeta.'],
      ['Arma la carta', 'Agrega categorías y platillos con fotos, o importa tu menú actual de una vez. Personaliza los colores y tipografías.'],
      ['Imprime tu QR', 'Descarga los códigos QR listos para imprimir, compártelos en redes y empieza a recibir pedidos hoy.'],
    ],
    faq: [
      { q: '¿Cuánto cuesta un menú digital?', a: 'En Kuik el plan Menú incluye el menú digital completo con QR, pedidos por WhatsApp, pago con tarjeta y reservaciones por una cuota mensual fija, sin comisiones por pedido. El primer mes es gratis y no necesitas tarjeta para empezar.' },
      { q: '¿Necesito que el cliente instale una app?', a: 'No. El menú abre en el navegador del celular al escanear el QR o tocar el enlace. Funciona en iPhone y Android sin descargar nada.' },
      { q: '¿Puedo importar mi menú actual?', a: 'Sí. Puedes subir tu carta en PDF o una hoja de cálculo y Kuik crea las categorías y productos por ti. También puedes empezar de cero y capturar platillo por platillo.' },
      { q: '¿Se puede ocultar precios o platillos agotados?', a: 'Sí. Marca un platillo como agotado y aparece atenuado o desaparece, como prefieras. También puedes ocultar precios por completo, por ejemplo para una carta de degustación.' },
      { q: '¿Funciona para varias sucursales?', a: 'Sí. En el plan Restaurante cada sucursal tiene su propia página con su WhatsApp, horario y dirección, y puede compartir el menú principal o tener uno independiente.' },
    ],
    related: ['pedidos-whatsapp', 'punto-de-venta', 'reservaciones'],
  },
  {
    slug: 'punto-de-venta',
    name: 'Punto de venta',
    metaTitle: 'Punto de venta para restaurantes | Kuik POS',
    description:
      'Punto de venta para restaurantes en tablet, celular o computadora: mesas, comandas a cocina, impresión de tickets, cajón de dinero y corte de caja. Funciona sin internet.',
    eyebrow: 'Punto de venta (POS)',
    h1: 'Punto de venta para restaurantes que corre en cualquier dispositivo',
    intro: [
      'El punto de venta de Kuik es el sistema con el que meseros y cajeros toman la orden, la mandan a cocina, cobran y cierran el turno. Corre en el navegador de una tablet, un celular o una computadora que ya tengas, sin instalar nada ni comprar equipo especial.',
      'Varios meseros pueden trabajar al mismo tiempo desde distintos dispositivos: cada uno abre sus mesas, la cocina ve las comandas en su pantalla y la caja cobra con efectivo, tarjeta o transferencia. Si se va el internet, el POS sigue cobrando y sincroniza solo cuando vuelve.',
    ],
    demo: { tablet: '/demo/pos', caption: 'Demo en vivo del punto de venta. Abre una mesa, agrega productos y cobra; nada se guarda.' },
    benefits: [
      { icon: 'layout', title: 'Mesas y plano del salón', text: 'Abre cuentas por mesa, divide la cuenta, mueve comensales de mesa y ve de un vistazo qué mesas están ocupadas, cuánto llevan y quién las atiende.' },
      { icon: 'chefHat', title: 'Pantalla de cocina (KDS)', text: 'Las comandas llegan a una pantalla en cocina y en barra, con el tiempo que llevan y colores por urgencia. El cocinero marca cada platillo listo y el mesero lo ve al instante.' },
      { icon: 'printer', title: 'Impresión automática', text: 'Tickets de cocina por estación, recibos para el cliente y corte de caja en impresoras térmicas de 58 u 80 mm. Compatible con Epson, Star, Bixolon, Xprinter y similares, por red, USB o Bluetooth.' },
      { icon: 'wallet', title: 'Caja y corte Z', text: 'Abre turno con fondo, cobra en efectivo, tarjeta o transferencia, registra propinas, abre el cajón de dinero y cierra con corte Z por caja. Varias cajas, cada una con su turno.' },
      { icon: 'wifiOff', title: 'Sigue sin internet', text: 'Todo se guarda primero en el dispositivo. Si se cae la conexión sigues tomando órdenes y cobrando; al volver se sincroniza sin duplicar nada.' },
      { icon: 'monitor', title: 'Pantalla del cliente', text: 'Una segunda pantalla frente al comensal muestra la cuenta en vivo, el total y el cambio. Puede ser otra pestaña o una tablet aparte.' },
    ],
    audience: {
      title: 'Qué reemplaza',
      items: [
        'Las comanderas de papel y los gritos a cocina.',
        'El punto de venta de escritorio que solo funciona en una computadora vieja.',
        'La calculadora y la libreta para el corte de caja.',
        'Las licencias por terminal: en Kuik agregas dispositivos sin costo extra.',
      ],
    },
    steps: [
      ['Activa el punto de venta', 'Desde tu panel enciende el módulo POS; el primer mes está incluido en la prueba gratis.'],
      ['Abre en tus dispositivos', 'Entra a app.kuik.mx/pos desde cada tablet o computadora y agrégalo a la pantalla de inicio. Nombra cada caja.'],
      ['Conecta impresoras', 'Instala el agente de impresión gratuito en una computadora del restaurante y asigna impresoras a cocina, barra y caja.'],
    ],
    faq: [
      { q: '¿Cuánto cuesta el punto de venta?', a: 'El POS es un complemento mensual que se agrega a cualquier plan de Kuik, con dispositivos ilimitados incluidos. El primer mes de prueba lo incluye sin costo.' },
      { q: '¿Qué equipo necesito?', a: 'Cualquier tablet, celular o computadora con navegador. Para imprimir, una impresora térmica de tickets y una computadora en la que corra el agente de impresión gratuito de Kuik, o impresoras conectadas a la red del restaurante.' },
      { q: '¿Pueden varios meseros usarlo al mismo tiempo?', a: 'Sí. Cada mesero entra desde su propio dispositivo con su nombre. Las mesas, comandas y cobros se sincronizan en tiempo real entre todos y con la pantalla de cocina.' },
      { q: '¿Funciona sin internet?', a: 'Sí. El POS guarda todo en el dispositivo y sigue cobrando sin conexión. Las impresoras en la misma red que la computadora con el agente siguen imprimiendo. Al volver el internet, sincroniza solo.' },
      { q: '¿Se integra con el menú digital?', a: 'Es el mismo menú. Los pedidos que los comensales hacen desde el QR o en línea aparecen en el POS y en la pantalla de cocina junto con los que toman los meseros.' },
    ],
    related: ['menu-digital', 'reservaciones', 'pedidos-whatsapp'],
  },
  {
    slug: 'reservaciones',
    name: 'Reservaciones',
    metaTitle: 'Sistema de reservaciones para restaurantes | Kuik',
    description:
      'Reservaciones en línea desde tu menú y puesto de anfitrión con plano de mesas, lista de espera y confirmación por WhatsApp. Sin comisión por comensal.',
    eyebrow: 'Reservaciones y anfitrión',
    h1: 'Reservaciones en línea y puesto de anfitrión para tu restaurante',
    intro: [
      'Tus comensales reservan desde el menú, desde el enlace en tu Instagram o desde Google Maps, eligiendo fecha, hora y número de personas. La reservación llega a tu panel y al WhatsApp del restaurante, y el cliente recibe la confirmación en el suyo.',
      'El puesto de anfitrión es la pantalla de la entrada: el plano de tu salón con cada mesa, quién está sentado, cuánto lleva y qué reservaciones están por llegar. Lista de espera con aviso por WhatsApp cuando la mesa está lista, sin comisión por comensal como cobran otras plataformas.',
    ],
    demo: { tablet: '/demo/host', phone: 'reservation', caption: 'Izquierda: el puesto de anfitrión con el plano del salón. Derecha: lo que ve el comensal al reservar desde el menú.' },
    benefits: [
      { icon: 'calendar', title: 'Reservación desde el menú', text: 'Un botón en tu menú digital y un enlace para redes. El comensal elige fecha, hora y personas; tú decides con cuánta anticipación, hasta cuántos días y el tamaño máximo de grupo.' },
      { icon: 'layout', title: 'Plano de mesas', text: 'Dibuja tu salón con mesas de distintas formas y capacidades por área: terraza, salón, barra. Asigna reservaciones a mesas y ve la ocupación en tiempo real.' },
      { icon: 'listChecks', title: 'Lista de espera', text: 'Anota a quienes llegan sin reservar, con tiempo estimado. Cuando se libera una mesa, avísales por WhatsApp con un toque.' },
      { icon: 'bell', title: 'Confirmación automática', text: 'Confirma cada reservación al instante o revísala antes. El cliente recibe la confirmación y un recordatorio por WhatsApp.' },
      { icon: 'clock', title: 'Turnos y tiempos de mesa', text: 'Define los servicios del día (comida, cena) y cuánto dura una mesa según el tamaño del grupo. Kuik calcula la capacidad y evita sobrevender.' },
      { icon: 'users', title: 'Historial de clientes', text: 'Reconoce a quien vuelve: cuántas veces ha venido, sus notas y preferencias, directamente en la pantalla del anfitrión.' },
    ],
    audience: {
      title: 'Comparado con OpenTable y similares',
      items: [
        'Sin comisión por comensal sentado: una cuota mensual fija dentro del plan Restaurante.',
        'Tus datos de clientes son tuyos, no de una plataforma que también promueve a la competencia.',
        'Integrado con el menú y el punto de venta: la mesa reservada abre su cuenta con un toque.',
        'Configurable en minutos, sin instalación ni capacitación presencial.',
      ],
    },
    steps: [
      ['Activa reservaciones', 'En tu panel enciende las reservaciones y define horarios, anticipación y tamaño de grupo.'],
      ['Dibuja tu salón', 'Agrega áreas y mesas con su capacidad. Toma menos de diez minutos con el editor visual.'],
      ['Recibe y sienta', 'Abre el puesto de anfitrión en una tablet en la entrada. Las reservaciones llegan solas y tú las asignas a mesas.'],
    ],
    faq: [
      { q: '¿Cobran comisión por reservación?', a: 'No. Las reservaciones y el puesto de anfitrión están incluidos en el plan Restaurante por una cuota mensual fija, sin importar cuántos comensales recibas.' },
      { q: '¿El cliente necesita registrarse?', a: 'No. Solo escribe su nombre, teléfono y número de personas. La confirmación le llega por WhatsApp.' },
      { q: '¿Puedo aceptar reservaciones manualmente?', a: 'Sí. Puedes elegir confirmación automática o revisar cada solicitud antes de aceptarla. El anfitrión también puede registrar reservaciones que llegan por teléfono.' },
      { q: '¿Funciona en una tablet en la entrada?', a: 'Sí. El puesto de anfitrión está diseñado para tablet en horizontal, pero también funciona en una computadora o en un celular.' },
      { q: '¿Se conecta con Google Maps o Instagram?', a: 'Puedes poner el enlace de reservaciones en tu perfil de Google Business, en Instagram y en Facebook. Al tocarlo, el cliente reserva directo en tu página de Kuik.' },
    ],
    related: ['menu-digital', 'punto-de-venta', 'pedidos-whatsapp'],
  },
  {
    slug: 'pedidos-whatsapp',
    name: 'Pedidos por WhatsApp',
    metaTitle: 'Pedidos por WhatsApp para restaurantes | Kuik',
    description:
      'Recibe pedidos por WhatsApp desde un menú digital con carrito: mesa, domicilio o para llevar, pago con tarjeta y bot que responde solo. Sin comisiones por pedido.',
    eyebrow: 'Pedidos por WhatsApp',
    h1: 'Pedidos por WhatsApp para tu restaurante, sin comisiones por pedido',
    intro: [
      'Tus clientes ya te escriben por WhatsApp. Kuik pone un menú con carrito delante de esa conversación: el cliente arma su pedido con opciones y extras, elige mesa, para llevar o a domicilio, y el mensaje llega a tu WhatsApp ordenado y completo, con el total calculado. Se acaban los pedidos a medias y las preguntas de "¿cuánto es?".',
      'Si quieres ir más lejos, el bot de WhatsApp de Kuik responde solo: manda el menú, toma el pedido, confirma el pago y avisa cuando está listo, con flujos que dibujas tú o con inteligencia artificial que contesta preguntas sobre tu carta.',
    ],
    demo: { phone: 'menu', caption: 'Arma un pedido en este menú real y verás cómo llegaría el mensaje al WhatsApp del restaurante.' },
    benefits: [
      { icon: 'whatsapp', title: 'Mensaje listo para cocina', text: 'Cada pedido llega con nombre, mesa o dirección, platillos con opciones, notas y total. Un formato que la cocina lee de un vistazo.' },
      { icon: 'creditCard', title: 'Cobra antes de preparar', text: 'Activa el pago con tarjeta y el cliente paga desde su celular. Recibes el pedido ya pagado, con recibo digital y código QR para el cliente.' },
      { icon: 'bell', title: 'Avisos que no se pierden', text: 'Notificación en tu celular, sonido en el tablero de pedidos, impresión automática en cocina y escalación por WhatsApp si nadie acepta el pedido en unos minutos.' },
      { icon: 'bot', title: 'Bot con flujos e IA', text: 'Dibuja el flujo de tu conversación (bienvenida, menú, horario, promociones) o deja que la IA conteste con la información de tu carta. Pasa a un humano cuando haga falta.' },
      { icon: 'heart', title: 'Programa de lealtad', text: 'Sellos o puntos por cada pedido, con la tarjeta de lealtad en el mismo menú. El cliente que vuelve se identifica con su teléfono.' },
      { icon: 'building', title: 'Un WhatsApp por sucursal', text: 'Cada sucursal recibe sus pedidos en su propio número, con su horario y zona de entrega, desde una sola cuenta.' },
    ],
    audience: {
      title: 'Comparado con las apps de entrega',
      items: [
        'Sin comisión del 25 al 35 por ciento por pedido: pagas una cuota mensual fija.',
        'El cliente es tuyo: tienes su teléfono, su historial y puedes escribirle.',
        'Entregas con tu propio repartidor o para llevar, con la zona y el costo de envío que tú definas.',
        'Funciona junto con las apps si las usas: el menú es el mismo.',
      ],
    },
    steps: [
      ['Pon tu número', 'Escribe el WhatsApp del restaurante y activa el carrito. Elige mesa, para llevar o a domicilio.'],
      ['Comparte el enlace', 'Ponlo en tu perfil de Instagram, Facebook y Google Maps, y en el mensaje de bienvenida de tu WhatsApp Business.'],
      ['Recibe pedidos', 'Los pedidos llegan a tu WhatsApp y a tu tablero. Acepta, imprime en cocina y avisa al cliente cuando esté listo.'],
    ],
    faq: [
      { q: '¿Necesito WhatsApp Business?', a: 'No para recibir pedidos: el mensaje llega a cualquier WhatsApp. Para el bot automático sí conectas un número de WhatsApp Business, y Kuik te guía en el proceso.' },
      { q: '¿Cobran comisión por pedido?', a: 'No. Los pedidos por WhatsApp están incluidos en todos los planes por una cuota mensual fija. Solo si activas el pago con tarjeta se cobra un pequeño porcentaje por transacción más la comisión del procesador.' },
      { q: '¿Puedo cobrar el envío?', a: 'Sí. Define costo de envío, envío gratis a partir de cierto monto y pedido mínimo. El menú lo calcula y lo muestra antes de enviar.' },
      { q: '¿Cómo me entero de un pedido nuevo?', a: 'Recibes el mensaje en WhatsApp, una notificación en tu celular, un sonido en el tablero de pedidos y, si tienes impresora, el ticket sale solo en cocina. Si nadie acepta el pedido en unos minutos, Kuik vuelve a avisar.' },
      { q: '¿El bot puede tomar pedidos solo?', a: 'Sí. Con el bot de WhatsApp del plan Restaurante puedes armar un flujo que manda el menú, toma el pedido y confirma, o dejar que la IA responda preguntas sobre tu carta y horarios.' },
    ],
    related: ['menu-digital', 'punto-de-venta', 'reservaciones'],
  },
];

export function featurePage(slug: string): FeaturePage | undefined {
  return FEATURE_PAGES.find((f) => f.slug === slug);
}
