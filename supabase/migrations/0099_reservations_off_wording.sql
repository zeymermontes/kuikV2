-- Kuik — "reservations off" canned reply: a call, never "write to us"
--
-- The seeded text invited the diner to write or call. With bookings off, a
-- message only lands back on the bot, so the default now says to call the
-- contact number. Only rows still carrying the old default are touched; a
-- restaurant that edited its own wording keeps it.

update whatsapp_canned_replies
   set body = 'Por ahora no estamos tomando reservaciones por este medio 🙏 Llámanos al {{telefono}} y con gusto te ayudamos.'
 where key = 'reservations_off'
   and body = 'Por ahora no estamos tomando reservaciones por este medio 🙏 Escríbenos o llámanos al {{telefono}} y con gusto te ayudamos.';
