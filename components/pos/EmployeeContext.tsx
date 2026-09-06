'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { PosDexie } from '@/lib/pos/db';
import type { Employee } from '@/lib/pos/types';
import { can, type Perm } from '@/lib/employees';
import { EmployeeSheet } from './EmployeeSheet';

// Who is at the register. When the restaurant has employees (dashboard →
// Equipo), the terminal asks for a PIN before use and each sale, payment and
// ticket carries the employee. Actions a role may not take (a discount, a
// void, opening the till) ask a manager to authorise with their PIN, the way
// every register does it: the manager leans over, taps their code, and the
// waiter carries on. With no employees set up, none of this appears and the
// terminal works as before with a typed server name.

interface EmployeeCtx {
  /** Active employees, from the offline store. */
  employees: Employee[];
  /** Whether the restaurant uses employees at all. */
  enabled: boolean;
  current: Employee | null;
  signIn: (e: Employee) => void;
  signOut: () => void;
  /** True when the current employee may, or a manager just authorised it. */
  authorize: (perm: Perm) => Promise<boolean>;
}

const Ctx = createContext<EmployeeCtx>({
  employees: [],
  enabled: false,
  current: null,
  signIn: () => {},
  signOut: () => {},
  authorize: async () => true,
});

export function useEmployee(): EmployeeCtx {
  return useContext(Ctx);
}

const STORAGE_KEY = 'pos_employee';

export function EmployeeProvider({
  db,
  tenantId,
  lockAfterSale,
  children,
}: {
  db: PosDexie;
  tenantId: string;
  /** Ask for a PIN again after every closed sale. */
  lockAfterSale: boolean;
  children: React.ReactNode;
}) {
  const rows = useLiveQuery(() => db.employees.toArray(), [db]);
  const employees = useMemo(() => (rows ?? []).filter((e) => e.active).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)), [rows]);
  const enabled = employees.length > 0;
  const loaded = rows !== undefined;

  const [currentId, setCurrentId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        setCurrentId(localStorage.getItem(STORAGE_KEY));
      } catch {}
      setRestored(true);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  // The device remembers who signed in; a deactivated employee is signed out.
  const current = useMemo(() => employees.find((e) => e.id === currentId) ?? null, [employees, currentId]);

  const signIn = useCallback((e: Employee) => {
    setCurrentId(e.id);
    try {
      localStorage.setItem(STORAGE_KEY, e.id);
    } catch {}
  }, []);
  const signOut = useCallback(() => {
    setCurrentId(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  // A pending authorisation: the sheet resolves it with true (PIN of someone
  // who may) or false (dismissed).
  const [authReq, setAuthReq] = useState<{ perm: Perm; resolve: (ok: boolean) => void } | null>(null);
  const authorize = useCallback(
    (perm: Perm) =>
      new Promise<boolean>((resolve) => {
        if (!enabled || can(current, perm)) return resolve(true);
        setAuthReq({ perm, resolve });
      }),
    [enabled, current],
  );

  const value = useMemo<EmployeeCtx>(
    () => ({ employees, enabled, current, signIn, signOut, authorize }),
    [employees, enabled, current, signIn, signOut, authorize],
  );

  // Lock after a sale: listened to through a custom event so the payment
  // sheet, deep in the tree, needs no extra prop for it.
  const lockRef = useRef(lockAfterSale);
  useEffect(() => {
    lockRef.current = lockAfterSale;
  }, [lockAfterSale]);
  useEffect(() => {
    const onSale = () => {
      if (lockRef.current && enabled) signOut();
    };
    window.addEventListener('kuik:pos-sale-closed', onSale);
    return () => window.removeEventListener('kuik:pos-sale-closed', onSale);
  }, [enabled, signOut]);

  const needSignIn = loaded && restored && enabled && !current;

  return (
    <Ctx.Provider value={value}>
      {children}
      {needSignIn && <EmployeeSheet db={db} tenantId={tenantId} mode="signin" employees={employees} onSignedIn={signIn} />}
      {authReq && (
        <EmployeeSheet
          db={db}
          tenantId={tenantId}
          mode="authorize"
          perm={authReq.perm}
          employees={employees}
          onAuthorized={() => {
            authReq.resolve(true);
            setAuthReq(null);
          }}
          onClose={() => {
            authReq.resolve(false);
            setAuthReq(null);
          }}
        />
      )}
    </Ctx.Provider>
  );
}

/** Tell the provider a sale just closed (PaymentSheet). */
export function announceSaleClosed(): void {
  window.dispatchEvent(new Event('kuik:pos-sale-closed'));
}
