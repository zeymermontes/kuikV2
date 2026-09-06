'use client';

import type { PosDexie } from './db';
import { enqueueUpsert, newId, nowISO } from './sync';
import type { TimeEntry } from './types';

/** The employee's open clock entry, if they are on the clock. */
export async function openEntryFor(db: PosDexie, employeeId: string): Promise<TimeEntry | null> {
  const rows = await db.time_entries.where('employee_id').equals(employeeId).toArray();
  return rows.find((e) => !e.clock_out) ?? null;
}

export async function clockIn(db: PosDexie, tenantId: string, employeeId: string): Promise<TimeEntry> {
  const t = nowISO();
  return enqueueUpsert(db, 'time_entries', {
    id: newId(),
    tenant_id: tenantId,
    employee_id: employeeId,
    clock_in: t,
    clock_out: null,
    note: null,
    created_at: t,
    updated_at: t,
  } satisfies TimeEntry);
}

export async function clockOut(db: PosDexie, entry: TimeEntry): Promise<TimeEntry> {
  return enqueueUpsert(db, 'time_entries', { ...entry, clock_out: nowISO() });
}
