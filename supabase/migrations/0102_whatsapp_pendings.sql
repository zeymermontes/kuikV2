-- Kuik — pendings: what a chat still owes its diner, written down.
--
-- The bot answers what it knows. When it does not ("¿piden anticipo?") it
-- told the diner that someone from the restaurant would get back to them,
-- and that was the end of it: nothing on any screen said a person had been
-- promised, or what the question was. The chat looked finished.
--
-- A pending is that promise as a row: the question in one line, on the chat
-- it belongs to, open until somebody at the restaurant marks it done. The
-- chats app lists the chat as waiting for a person while it has any, and
-- shows them on the chat and on the booking that chat is about.
--
-- A booking waiting to be accepted is NOT stored here: that is the booking's
-- own status, and the screens read it from there, so the two cannot disagree.

create table if not exists whatsapp_pendings (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants on delete cascade,
  conversation_id uuid not null references whatsapp_conversations on delete cascade,
  -- What has to be answered, short enough to read in a list.
  summary         text not null check (char_length(summary) between 1 and 300),
  -- Who wrote it down: the bot, on its own turn, or a person.
  created_by      text not null default 'bot' check (created_by in ('bot', 'staff')),
  -- Null while it is open.
  done_at         timestamptz,
  done_by         uuid references auth.users on delete set null,
  created_at      timestamptz not null default now()
);

-- The one question asked of it: what is still open, per chat.
create index if not exists whatsapp_pendings_open_idx
  on whatsapp_pendings (tenant_id, conversation_id) where done_at is null;

alter table whatsapp_pendings enable row level security;

-- Staff read and close these through server actions (service role, after
-- the role check); the policy covers the owner working from the panel.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'whatsapp_pendings' and policyname = 'whatsapp_pendings_owner_all') then
    create policy whatsapp_pendings_owner_all on whatsapp_pendings for all
      using (public.owns_tenant(tenant_id) or public.is_super_admin())
      with check (public.owns_tenant(tenant_id) or public.is_super_admin());
  end if;
end $$;
