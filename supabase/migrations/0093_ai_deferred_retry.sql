-- A model that fails twice in a row gets a breather, not a handoff: the run
-- remembers what the diner said and when to try once more.
alter table whatsapp_flow_runs
  add column if not exists ai_retry_at timestamptz,
  add column if not exists ai_retry_text text;
comment on column whatsapp_flow_runs.ai_retry_at is 'When to replay the diner''s last message through the model after two failed attempts; null = nothing pending.';
comment on column whatsapp_flow_runs.ai_retry_text is 'The message to replay.';

create index if not exists wa_flow_runs_ai_retry_idx on whatsapp_flow_runs (ai_retry_at)
  where status = 'active' and ai_retry_at is not null;
