-- Kuik — POS cash count mode
-- 'total' = the register close asks for one cash total; 'denominations' = count
-- by each bill/coin. Optional custom denomination list (else POS defaults).

alter table tenant_ordering
  add column cash_count_mode   text not null default 'total'
    check (cash_count_mode in ('total', 'denominations')),
  add column cash_denominations jsonb;
