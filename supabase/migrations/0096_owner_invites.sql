-- Kuik — owner invites: a restaurant can be handed to an address that has no
-- account yet. The super admin leaves a tenant_invites row with role 'owner';
-- whoever later signs in with that (confirmed) address claims the restaurant:
-- ownership is re-pointed and the previous owner loses access, exactly as the
-- immediate transfer in app/(dashboard)/admin/actions.ts does.

-- Owner invites are the super admin's alone. A restaurant's owner keeps full
-- control of staff invites but can neither create an owner invite nor see or
-- cancel one that is pending on their restaurant.
drop policy if exists invites_owner_all on tenant_invites;
create policy invites_owner_all on tenant_invites for all
  using ((owns_tenant(tenant_id) and role <> 'owner') or is_super_admin())
  with check ((owns_tenant(tenant_id) and role <> 'owner') or is_super_admin());

create or replace function public.claim_pending_invites()
returns void language plpgsql security definer set search_path = public as $$
declare
  uemail text;
  inv record;
  old_owner uuid;
begin
  -- Only a confirmed address can claim: otherwise signing up with someone
  -- else's email would be enough to take what was meant for them.
  select lower(email) into uemail from auth.users
    where id = auth.uid() and email_confirmed_at is not null;
  if uemail is null then return; end if;

  -- The common case, checked cheaply: this runs on every authenticated load.
  if not exists (
    select 1 from tenant_invites where lower(email) = uemail and accepted_at is null
  ) then return; end if;

  -- Restaurants waiting for this person as their owner.
  for inv in
    select i.id, i.tenant_id from tenant_invites i
    where lower(i.email) = uemail and i.accepted_at is null and i.role = 'owner'
  loop
    select owner_id into old_owner from tenants where id = inv.tenant_id for update;
    if old_owner is distinct from auth.uid() then
      update tenants set owner_id = auth.uid(), updated_at = now() where id = inv.tenant_id;
      delete from tenant_members where tenant_id = inv.tenant_id and user_id = old_owner;
      insert into audit_log (actor_id, tenant_id, action, detail)
        values (auth.uid(), inv.tenant_id, 'claim_tenant',
                jsonb_build_object('from', old_owner, 'to', auth.uid(), 'email', uemail, 'invite', inv.id));
    end if;
    insert into tenant_members (tenant_id, user_id, role, email)
      values (inv.tenant_id, auth.uid(), 'owner', uemail)
      on conflict (tenant_id, user_id) do update set role = 'owner';
  end loop;

  -- Staff invites.
  insert into tenant_members (tenant_id, user_id, role, email)
    select i.tenant_id, auth.uid(), i.role, uemail
    from tenant_invites i
    where lower(i.email) = uemail and i.accepted_at is null and i.role <> 'owner'
    on conflict (tenant_id, user_id) do nothing;

  update tenant_invites set accepted_at = now()
    where lower(email) = uemail and accepted_at is null;
end;
$$;
