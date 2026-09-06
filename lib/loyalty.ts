// The loyalty card, as pure arithmetic: how far a member is from the reward.
// Shared by the diner's card on the menu, the dashboard and the register.

import type { LoyaltyCustomer, LoyaltyProgram } from '@/lib/database.types';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous characters

/** A short member code shown as a QR; unique per tenant (the caller retries on collision). */
export function makeLoyaltyCode(len = 6): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

export interface RewardProgress {
  /** 'stamps' | 'points' */
  type: LoyaltyProgram['type'];
  have: number;
  need: number;
  /** 0..1 */
  ratio: number;
  /** The member can redeem now. */
  eligible: boolean;
  reward: string | null;
}

/** Where a member stands on the program; `need` is 0 when the program has no reward set. */
export function rewardProgress(
  program: Pick<LoyaltyProgram, 'type' | 'stamps_needed' | 'reward_description' | 'points_for_reward' | 'points_reward_description'>,
  customer: Pick<LoyaltyCustomer, 'stamps' | 'points'>,
): RewardProgress {
  if (program.type === 'stamps') {
    const need = Math.max(0, program.stamps_needed || 0);
    const have = customer.stamps;
    return { type: 'stamps', have, need, ratio: need ? Math.min(1, have / need) : 0, eligible: need > 0 && have >= need, reward: program.reward_description };
  }
  const need = Math.max(0, program.points_for_reward ?? 0);
  const have = Number(customer.points) || 0;
  return { type: 'points', have, need, ratio: need ? Math.min(1, have / need) : 0, eligible: need > 0 && have >= need, reward: program.points_reward_description };
}

/** Digits only, as loyalty stores phones; null when too short to be one. */
export function loyaltyPhone(input: string): string | null {
  const d = input.replace(/\D/g, '');
  return d.length >= 8 ? d : null;
}
