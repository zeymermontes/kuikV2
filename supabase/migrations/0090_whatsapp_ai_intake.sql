-- Kuik — how the AI asks for a booking's details
--
-- Some restaurants want the bot to ask one thing at a time; others (Mar and
-- Sea, from their own experience) want everything requested in one message
-- and then only the gaps chased. A per-restaurant switch, read by the prompt.

alter table whatsapp_settings
  add column if not exists ai_intake text not null default 'one_by_one'
    check (ai_intake in ('one_by_one', 'all_at_once'));
