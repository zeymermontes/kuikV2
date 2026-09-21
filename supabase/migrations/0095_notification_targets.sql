-- Who a notification is for, when it is for one person rather than a role.
--
-- A diner answering a human mid-handoff should reach THAT human — the one
-- who wrote the last staff message — not everyone who could have. Two
-- columns make that possible:
--
--   whatsapp_messages.sent_by  the account behind a staff_dashboard message
--                              (null for the bot, the system, and echoes from
--                              the restaurant's own phone, which carry no login)
--   staff_alerts.user_id       an alert addressed to one person; every open
--                              screen still hears the row over Realtime and
--                              shows it only to that account

alter table whatsapp_messages
  add column if not exists sent_by uuid references auth.users on delete set null;

alter table staff_alerts
  add column if not exists user_id uuid references auth.users on delete cascade;
