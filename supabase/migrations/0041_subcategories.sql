-- Kuik — subcategories
--
-- A category may now hang off another one, so a menu can read the way a printed
-- one does: "Desayunos" is the tab, and inside it sit "Para comenzar",
-- "Omelettes y huevos", "Chilaquiles"… Only the top level shows in the category
-- selector; subcategories render as headings inside their parent's section.
--
-- Nesting is deliberately ONE level deep. Two levels would need a tree in the
-- editor, the tab bar and the scroll-spy for very little gain on a food menu,
-- so a category that already has a parent may not become a parent itself.

alter table categories
  add column parent_id uuid references categories on delete cascade;

create index categories_parent_idx on categories (parent_id, position);

-- Enforce the single level, and keep a child on the same branch as its parent.
create or replace function categories_check_parent()
returns trigger
language plpgsql
as $$
declare
  parent_row categories%rowtype;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'A category cannot be its own parent';
  end if;

  select * into parent_row from categories where id = new.parent_id;
  if not found then
    raise exception 'Parent category % not found', new.parent_id;
  end if;

  if parent_row.parent_id is not null then
    raise exception 'Subcategories may not be nested more than one level deep';
  end if;

  if parent_row.tenant_id <> new.tenant_id then
    raise exception 'A subcategory must belong to the same tenant as its parent';
  end if;

  if parent_row.branch_id is distinct from new.branch_id then
    raise exception 'A subcategory must belong to the same branch as its parent';
  end if;

  return new;
end;
$$;

create trigger categories_check_parent_trg
  before insert or update of parent_id, branch_id, tenant_id on categories
  for each row execute function categories_check_parent();

-- A category that becomes a parent must not still be someone's child.
create or replace function categories_block_parent_with_children()
returns trigger
language plpgsql
as $$
begin
  if new.parent_id is not null
     and exists (select 1 from categories where parent_id = new.id) then
    raise exception 'A category with subcategories cannot become a subcategory';
  end if;
  return new;
end;
$$;

create trigger categories_block_parent_with_children_trg
  before update of parent_id on categories
  for each row execute function categories_block_parent_with_children();
