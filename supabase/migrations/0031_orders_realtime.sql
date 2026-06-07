-- Kuik — realtime for the order board
-- Stream order inserts/updates to the dashboard over websockets (no polling).
-- RLS still applies: subscribers only receive their tenant's rows.

alter table orders replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table orders;
  end if;
end $$;
