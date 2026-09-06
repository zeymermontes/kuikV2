-- Kuik — one cash shift per register
--
-- A restaurant may run several registers at once (caja, barra, terraza), each
-- with its own opening float and its own Z report. A shift now names the
-- register that opened it (the slug of the device's register name, the same
-- one the customer screen follows). Null = shifts from before, which the
-- default register ("caja") keeps treating as its own.
alter table register_shifts add column if not exists register text;
create index if not exists register_shifts_register_idx on register_shifts (tenant_id, register, status);
