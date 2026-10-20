-- Kuik — WhatsApp contacts are users, not devices
--
-- The bridge used to report an inbound sender with its device part
-- ("<user>:<device>@s.whatsapp.net" or "@lid"), and the contact was keyed by
-- that. A diner who wrote from a linked computer therefore got a contact that
-- WhatsApp refuses to send to ("message recipient must be a user JID with no
-- device part"), so the bot's reply failed. The bridge and the webhook now
-- strip the device; this brings the rows already stored into line.
--
-- Only rows whose stripped id is not already taken by another contact of the
-- same restaurant are renamed: a clash means the same person exists twice,
-- and merging conversations is a job for the dedupe in
-- lib/notify/bridge-conversation.ts, not for a blind update.

update whatsapp_contacts c
   set wa_id = regexp_replace(c.wa_id, '^([^:@]+):[0-9]+@', '\1@')
 where c.wa_id ~ '^[^:@]+:[0-9]+@'
   and not exists (
     select 1 from whatsapp_contacts o
      where o.tenant_id = c.tenant_id
        and o.wa_id = regexp_replace(c.wa_id, '^([^:@]+):[0-9]+@', '\1@')
   );
