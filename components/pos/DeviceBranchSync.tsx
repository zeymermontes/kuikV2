'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { readDeviceBranch, saveDeviceBranch, type DeviceBranch } from '@/lib/pos/branch';

/**
 * Keeps the device's branch and the page's `?branch=` in step. Opened with
 * the parameter: remember it. Opened without it, on a device that remembers
 * one: reopen with it, so a bookmark or the app's home always lands on the
 * right branch. `?branch=main` clears the memory (the main location).
 */
export function DeviceBranchSync({ branch }: { branch: DeviceBranch | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    const param = params.get('branch');
    if (param === 'main') {
      saveDeviceBranch(null);
      return;
    }
    if (branch) {
      saveDeviceBranch(branch);
      return;
    }
    if (param) return; // unknown branch: the page fell back to the main location
    const remembered = readDeviceBranch();
    if (!remembered) return;
    const next = new URLSearchParams(params.toString());
    next.set('branch', remembered.id);
    router.replace(`${pathname}?${next.toString()}`);
  }, [branch, params, pathname, router]);

  return null;
}
