-- Kuik — public bucket for the native apps' downloads
--
-- native/scripts/publish-apk.mjs uploads each Android release here (with the
-- service role) and keeps latest.json, which kuik.mx/apps and the in-app
-- update banner read. Public: anyone can download; nobody but the service
-- role can write, since no insert/update policy exists for it.

insert into storage.buckets (id, name, public, file_size_limit)
values ('apps', 'apps', true, 314572800)
on conflict (id) do update set public = true, file_size_limit = 314572800;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'apps public read') then
    create policy "apps public read" on storage.objects for select using (bucket_id = 'apps');
  end if;
end $$;
