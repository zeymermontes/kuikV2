-- A flow can have a last day: a seasonal option on the bot's menu (posadas,
-- a Mother's Day menu) that must stop being offered by itself the day after,
-- without anybody remembering to switch it off. Read in the restaurant's
-- own calendar (tenants.timezone); null means always.
alter table whatsapp_flows add column if not exists active_until date;
