-- Kuik — customers at the register
--
-- The cashier looks a diner up by phone, sees their loyalty card and their
-- visits, and puts them on the sale. When the sale closes, the stamp or the
-- points land on the card by themselves.
--
-- The award happens in a trigger, not in the app: a sale closed with the
-- internet down reaches the server minutes later through the offline outbox,
-- and the trigger fires then. `loyalty_awarded_at` makes it happen once no
-- matter how many times the row is upserted.

alter table tabs
  add column if not exists customer_phone      text,
  add column if not exists loyalty_customer_id uuid references loyalty_customers on delete set null,
  add column if not exists loyalty_awarded_at  timestamptz;

create index if not exists tabs_customer_phone_idx on tabs (tenant_id, customer_phone) where customer_phone is not null;

create or replace function public.tabs_award_loyalty()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  prog loyalty_program%rowtype;
  earned numeric(10,2);
begin
  if new.status <> 'paid' or new.loyalty_customer_id is null or new.loyalty_awarded_at is not null then
    return new;
  end if;
  select * into prog from loyalty_program where tenant_id = new.tenant_id;
  if not found or not prog.enabled then
    return new;
  end if;

  if prog.type = 'stamps' then
    update loyalty_customers
       set stamps = stamps + 1, total_visits = total_visits + 1
     where id = new.loyalty_customer_id and tenant_id = new.tenant_id;
    if found then
      insert into loyalty_events (tenant_id, customer_id, kind, stamps_delta, amount)
      values (new.tenant_id, new.loyalty_customer_id, 'earn', 1, new.total);
    end if;
  else
    earned := round(coalesce(new.total, 0) * coalesce(prog.points_per_currency, 1), 2);
    update loyalty_customers
       set points = points + earned, total_visits = total_visits + 1
     where id = new.loyalty_customer_id and tenant_id = new.tenant_id;
    if found then
      insert into loyalty_events (tenant_id, customer_id, kind, points_delta, amount)
      values (new.tenant_id, new.loyalty_customer_id, 'earn', earned, new.total);
    end if;
  end if;

  new.loyalty_awarded_at := now();
  return new;
end;
$$;

drop trigger if exists tabs_loyalty on tabs;
create trigger tabs_loyalty before insert or update of status, loyalty_customer_id on tabs
  for each row execute function public.tabs_award_loyalty();
