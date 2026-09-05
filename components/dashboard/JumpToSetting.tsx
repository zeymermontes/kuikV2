'use client';

import { useEffect } from 'react';
import { findSettings, revealSetting } from '@/lib/settings-search';

/**
 * Drop into any settings page: when the URL carries ?q=<label> (the admin-wide
 * search lands people this way) the matching row is outlined and scrolled to.
 */
export function JumpToSetting() {
  useEffect(() => {
    const jump = (q: string | null) => {
      if (!q) return;
      const root = document.querySelector<HTMLElement>('main') ?? document.body;
      const hit = findSettings(root, q)[0];
      if (hit) revealSetting(root, hit);
    };
    const id = setTimeout(() => jump(new URLSearchParams(window.location.search).get('q')), 80);
    const onJump = (e: Event) => jump((e as CustomEvent<string>).detail);
    window.addEventListener('kuik:jump', onJump);
    return () => {
      clearTimeout(id);
      window.removeEventListener('kuik:jump', onJump);
    };
  }, []);
  return null;
}
