-- Kuik — the media bucket: per-tenant write, sane sizes, and a way to find orphans
--
-- Since 0001 any signed-in user could write anywhere in `media`, any size,
-- any type: the compression and the folder layout were only enforced by the
-- dashboard's own code, which a direct call to the storage API skips. Now:
--
--   - a file may be at most 15 MB (a PDF menu, a font, a song fit; a raw
--     photo straight off a camera does not, and the dashboard compresses it
--     to a fraction of that before uploading anyway);
--   - a member writes only under a tenant they belong to, only with the
--     extensions the dashboard produces, and never under landing/, which the
--     super admin deploys with the service role (bypasses RLS, as before);
--   - media_referenced_paths() lists every media object the database still
--     points at, so lib/media/sweep.ts can delete the rest (replaced photos,
--     re-imported menus) instead of letting the bucket grow forever.

update storage.buckets set file_size_limit = 15728640 where id = 'media';

create or replace function public.media_write_allowed(p_name text)
returns boolean language sql stable as $$
  select
    -- <tenant uuid>/<folder>/<file>, and not the super admin's landing deploy
    p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    and p_name !~ '^[0-9a-f-]{36}/landing/'
    and p_name ~* '\.(jpe?g|png|webp|gif|svg|pdf|woff2?|ttf|otf|mp3)$'
    and (public.is_member(split_part(p_name, '/', 1)::uuid) or public.is_super_admin());
$$;

drop policy if exists "media authed write"  on storage.objects;
drop policy if exists "media authed update" on storage.objects;
drop policy if exists "media authed delete" on storage.objects;
drop policy if exists "media member write"  on storage.objects;
drop policy if exists "media member update" on storage.objects;
drop policy if exists "media member delete" on storage.objects;

create policy "media member write" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.media_write_allowed(name));
create policy "media member update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.media_write_allowed(name))
  with check (bucket_id = 'media' and public.media_write_allowed(name));
create policy "media member delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.media_write_allowed(name));

-- Every media object path the database references, found by scanning the text
-- of every row of every public table for the bucket's public URL. Generic on
-- purpose: a new column that stores an image URL is covered without anyone
-- remembering to list it here. Service role only (the sweep).
create or replace function public.media_referenced_paths()
returns setof text language plpgsql security definer set search_path = public as $$
declare
  t record;
begin
  for t in
    select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
  loop
    return query execute format(
      $q$select distinct m[1] from %I x, regexp_matches(x::text, '/storage/v1/object/public/media/([^"''\s\\),]+)', 'g') as m$q$,
      t.table_name
    );
  end loop;
end;
$$;
revoke execute on function public.media_referenced_paths() from public, anon, authenticated;
