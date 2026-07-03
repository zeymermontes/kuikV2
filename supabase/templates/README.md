# Plantillas de correo de Kuik (Supabase Auth)

Plantillas HTML listas para pegar en **Supabase → Authentication → Emails → Templates**.
Diseño consistente con la marca: acento ámbar (`#f59e0b` / `#d97706`), texto y botón
negros (`#171717`), tipografía del sistema. HTML seguro para clientes de correo
(tablas, estilos en línea, sin imágenes externas ni JS).

## Dónde pegar cada una

En el dashboard de Supabase, cada plantilla tiene su propio recuadro. Pega el HTML
en el campo **Message body** y el asunto en **Subject**:

| Archivo | Slot en Supabase | Asunto sugerido | ¿Se usa hoy? |
|---|---|---|---|
| `confirm-signup.html` | Confirm signup | `Confirma tu cuenta de Kuik` | ✅ Activo (registro) |
| `reset-password.html` | Reset Password | `Restablece tu contraseña de Kuik` | ⚠️ Solo si agregas el flujo de reset |
| `magic-link.html` | Magic Link | `Tu enlace de acceso a Kuik` | ⚠️ Solo si activas magic link |
| `change-email.html` | Change Email Address | `Confirma tu nuevo correo en Kuik` | ⚠️ Solo si permites cambiar correo |
| `reauthentication.html` | Reauthentication | `Tu código de verificación de Kuik` | ⚠️ Solo si activas OTP/reauth |
| `invite.html` | Invite user | `Te invitaron a un restaurante en Kuik` | ❌ Los invites de staff son in-app; solo aplica si usas `admin.inviteUserByEmail` |

Hoy la app usa **email + contraseña con confirmación de registro**, así que la única
plantilla que se dispara de forma normal es **Confirm signup**. Las demás quedan
listas por si activas esos flujos.

## Variables (plantillas Go de Supabase)

- `{{ .ConfirmationURL }}` — enlace de acción completo (usado en la mayoría)
- `{{ .Token }}` — código de 6 dígitos (solo en `reauthentication.html`)
- `{{ .NewEmail }}` — correo nuevo (solo en `change-email.html`)
- Otras disponibles: `{{ .SiteURL }}`, `{{ .Email }}`, `{{ .TokenHash }}`, `{{ .RedirectTo }}`

## Notas importantes

1. **Entregabilidad / producción.** El servicio de correo *por defecto* de Supabase
   tiene un límite muy bajo (unos pocos correos por hora en todo el proyecto) y es
   solo para pruebas. Como el registro depende del correo de confirmación, configura
   **SMTP propio** (Resend, SendGrid, etc.) en *Authentication → Emails → SMTP Settings*
   antes de recibir tráfico real.

2. **Site URL / redirect.** El destino de `{{ .ConfirmationURL }}` lo define
   *Authentication → URL Configuration* (Site URL + Redirect URLs), no la plantilla.
   Apunta al dominio correcto (p. ej. `https://app.kuik.mx`).

3. **Logo.** El encabezado usa el wordmark `kuik.` en texto (nunca se rompe). Si
   quieres una imagen, reemplaza el `<span>` del wordmark por
   `<img src="https://kuik.mx/logo.png" width="96" alt="Kuik" style="display:block;margin:0 auto;">`
   usando una URL pública y estable.

4. **Idioma.** Están en español (locale por defecto de la app). Supabase usa una sola
   plantilla por proyecto; si necesitas inglés, se puede versionar aparte.
