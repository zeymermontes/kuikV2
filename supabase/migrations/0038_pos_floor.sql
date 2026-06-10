-- Kuik — POS floor map + server attribution
-- pos_tables: how many numbered tables the floor map shows (0 = no map).
-- tabs.server_name: which waiter opened the tab (Fudo-style attribution).

alter table tenant_ordering
  add column pos_tables int not null default 0;

alter table tabs
  add column server_name text;
