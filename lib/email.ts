import 'server-only';
import { APP_URL } from '@/lib/config';
import type { MemberRole } from '@/lib/database.types';

/**
 * Transactional email over Resend's HTTP API. Without RESEND_API_KEY nothing is
 * sent and the caller carries on: an invite still works in-app (it is claimed
 * on sign-in), the email is only how the person finds out about it.
 */
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? 'Kuik <hola@kuik.mx>',
        to: [to],
        subject,
        html,
      }),
    });
    if (!res.ok) console.error('[email] resend', res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error('[email] resend', err);
    return false;
  }
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Same shell as supabase/templates/*.html, so every Kuik email looks alike. */
function layout(o: { preheader: string; title: string; body: string; cta: string; url: string; footer: string }): string {
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${o.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f4;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e7e5e4;border-radius:16px;overflow:hidden;font-family:${font};">
        <tr><td style="height:4px;background-color:#f59e0b;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 40px 8px;text-align:center;"><span style="font-size:24px;font-weight:800;letter-spacing:-0.5px;color:#171717;">kuik<span style="color:#f59e0b;">.</span></span></td></tr>
        <tr><td style="padding:8px 40px 0;text-align:center;"><h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700;color:#171717;">${o.title}</h1></td></tr>
        <tr><td style="padding:16px 40px 0;text-align:center;"><p style="margin:0;font-size:15px;line-height:1.6;color:#57534e;">${o.body}</p></td></tr>
        <tr><td style="padding:28px 40px 8px;text-align:center;"><a href="${o.url}" style="display:inline-block;background-color:#171717;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 28px;border-radius:10px;">${o.cta}</a></td></tr>
        <tr><td style="padding:12px 40px 0;text-align:center;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#a8a29e;">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
          <p style="margin:6px 0 0;font-size:12px;line-height:1.6;word-break:break-all;"><a href="${o.url}" style="color:#d97706;text-decoration:underline;">${o.url}</a></p>
        </td></tr>
        <tr><td style="padding:28px 40px 0;"><div style="height:1px;background-color:#e7e5e4;font-size:0;line-height:0;">&nbsp;</div></td></tr>
        <tr><td style="padding:20px 40px 32px;text-align:center;"><p style="margin:0;font-size:12px;line-height:1.6;color:#a8a29e;">${o.footer}</p></td></tr>
      </table>
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
        <tr><td style="padding:20px 40px;text-align:center;"><p style="margin:0;font-size:12px;color:#a8a29e;font-family:${font};">Kuik · Menús digitales para restaurantes · <a href="https://kuik.mx" style="color:#a8a29e;text-decoration:underline;">kuik.mx</a></p></td></tr>
      </table>
    </td>
  </tr>
</table>`;
}

const ROLE_ES: Record<MemberRole, string> = {
  owner: 'dueño',
  manager: 'manager',
  cashier: 'cajero',
  waiter: 'mesero',
  host: 'host',
};

/**
 * Where an invite email sends the person. Sign-up carries the address so the
 * account is created with the one the invite is waiting for; someone who
 * already has an account is bounced from there to sign in (see signUp).
 */
export function inviteUrl(email: string): string {
  return `${APP_URL}/signup?invite=1&email=${encodeURIComponent(email)}`;
}

/** "You were added to the team of X." Sent when an owner invites staff. */
export function sendStaffInviteEmail(to: string, restaurant: string, role: MemberRole) {
  const name = esc(restaurant);
  return sendEmail(
    to,
    `Te invitaron a ${restaurant} en Kuik`,
    layout({
      preheader: `Te invitaron a colaborar en ${name}.`,
      title: `Te invitaron a ${name}`,
      body: `Te agregaron al equipo de <strong>${name}</strong> como <strong>${ROLE_ES[role] ?? role}</strong>. Crea tu cuenta (o inicia sesión) con este correo y el acceso aparece solo.`,
      cta: 'Aceptar invitación',
      url: inviteUrl(to),
      footer: 'Si no esperabas esta invitación, puedes ignorar este correo.',
    }),
  );
}

/** "X is yours to claim." Sent when the super admin hands a restaurant to a new address. */
export function sendOwnerInviteEmail(to: string, restaurant: string) {
  const name = esc(restaurant);
  return sendEmail(
    to,
    `Reclama ${restaurant} en Kuik`,
    layout({
      preheader: `${name} te está esperando en Kuik.`,
      title: `Reclama ${name}`,
      body: `Te asignaron como dueño de <strong>${name}</strong> en Kuik. Crea tu cuenta (o inicia sesión) con este correo y el restaurante pasa a ser tuyo, con su menú y su configuración tal como están.`,
      cta: 'Reclamar restaurante',
      url: inviteUrl(to),
      footer: 'Si no esperabas este correo, puedes ignorarlo: nada cambia hasta que alguien entre con esta dirección.',
    }),
  );
}
