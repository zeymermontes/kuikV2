-- Kuik — an option can run out ("no oat milk today")
--
-- Options live inside each product's jsonb (option_groups, and the legacy
-- variants / modifiers). An option gains `available: false` while it is out;
-- the menu and the register show it greyed and refuse to pick it. Since the
-- same option ("Leche de avena") sits in many products, one call marks it
-- everywhere by name. Security definer with the POS check, so a waiter may
-- 86 an option from the floor the way they already 86 a product (0045).

create or replace function public.mark_options(arr jsonb, p_name text, p_available boolean, out result jsonb, out hits int)
language plpgsql as $$
declare opt jsonb;
begin
  result := '[]'::jsonb;
  hits := 0;
  for opt in select * from jsonb_array_elements(coalesce(arr, '[]'::jsonb)) loop
    if lower(trim(opt->>'name')) = lower(trim(p_name)) then
      opt := opt || jsonb_build_object('available', p_available);
      hits := hits + 1;
    end if;
    result := result || jsonb_build_array(opt);
  end loop;
end;
$$;

create or replace function public.set_option_availability(p_tenant uuid, p_name text, p_available boolean)
returns int language plpgsql security definer set search_path = public as $$
declare
  prod record;
  n int := 0;
  k int;
  grp jsonb;
  groups jsonb;
  opts jsonb;
  vars jsonb;
  mods jsonb;
begin
  if not (public.can_operate_pos(p_tenant) or public.is_super_admin()) then
    raise exception 'forbidden';
  end if;
  for prod in select id, option_groups, variants, modifiers from products where tenant_id = p_tenant loop
    groups := '[]'::jsonb;
    for grp in select * from jsonb_array_elements(coalesce(prod.option_groups, '[]'::jsonb)) loop
      select result, hits into opts, k from public.mark_options(grp->'options', p_name, p_available);
      n := n + k;
      groups := groups || jsonb_build_array(grp || jsonb_build_object('options', opts));
    end loop;
    select result, hits into vars, k from public.mark_options(prod.variants, p_name, p_available);
    n := n + k;
    select result, hits into mods, k from public.mark_options(prod.modifiers, p_name, p_available);
    n := n + k;
    update products set option_groups = groups, variants = vars, modifiers = mods where id = prod.id;
  end loop;
  return n;
end;
$$;
revoke execute on function public.set_option_availability(uuid, text, boolean) from anon;
