/**
 * A tiny script injected into every custom landing's HTML.
 *
 * The landing runs in a sandboxed iframe WITHOUT `allow-same-origin`, so it
 * lives in an opaque origin: it cannot read our cookies, call our API, or touch
 * the parent document. That isolation is deliberate — a restaurant uploads
 * arbitrary HTML and we are not going to trust it — which leaves `postMessage`
 * as the only way for it to ask the app for anything.
 *
 * So the landing gets a five-line global instead of an API surface:
 *
 *   Kuik.reservar()      opens Kuik's reservation sheet over the landing
 *   Kuik.whatsapp(texto) opens the restaurant's WhatsApp chat
 *   Kuik.menu()          navigates to the digital menu
 *
 * Anything else it wants to do, it does with plain links and `target="_top"`.
 */
export const LANDING_BRIDGE = `<script>
(function () {
  function send(action, payload) {
    try { parent.postMessage({ source: 'kuik-landing', action: action, payload: payload }, '*'); }
    catch (e) { /* no parent: the page was opened directly */ }
  }
  window.Kuik = {
    reservar: function () { send('reserve'); },
    whatsapp: function (text) { send('whatsapp', { text: text || '' }); },
    menu: function () { send('menu'); }
  };
  // Also works with plain markup, so a landing needs no JavaScript at all:
  //   <button data-kuik="reservar">Reservar</button>
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest && e.target.closest('[data-kuik]');
    if (!el) return;
    var action = el.getAttribute('data-kuik');
    if (action === 'reservar' || action === 'reserve') { e.preventDefault(); send('reserve'); }
    else if (action === 'whatsapp') { e.preventDefault(); send('whatsapp', { text: el.getAttribute('data-text') || '' }); }
    else if (action === 'menu') { e.preventDefault(); send('menu'); }
  });
})();
</script>`;
