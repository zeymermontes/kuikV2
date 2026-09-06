import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loyaltyPhone, makeLoyaltyCode, rewardProgress } from '../lib/loyalty';

describe('rewardProgress', () => {
  const stamps = { type: 'stamps' as const, stamps_needed: 10, reward_description: 'Café gratis', points_for_reward: null, points_reward_description: null };
  const points = { type: 'points' as const, stamps_needed: 10, reward_description: null, points_for_reward: 500, points_reward_description: 'Postre' };
  it('counts stamps toward the reward', () => {
    assert.deepEqual(rewardProgress(stamps, { stamps: 4, points: 0 }), { type: 'stamps', have: 4, need: 10, ratio: 0.4, eligible: false, reward: 'Café gratis' });
    assert.equal(rewardProgress(stamps, { stamps: 10, points: 0 }).eligible, true);
  });
  it('counts points, capped at a full bar', () => {
    const p = rewardProgress(points, { stamps: 0, points: 650 });
    assert.equal(p.ratio, 1);
    assert.equal(p.eligible, true);
    assert.equal(p.reward, 'Postre');
  });
  it('is never eligible without a reward set', () => {
    assert.equal(rewardProgress({ ...points, points_for_reward: null }, { stamps: 0, points: 999 }).eligible, false);
  });
});

describe('helpers', () => {
  it('phones are digits, at least 8', () => {
    assert.equal(loyaltyPhone('+52 (33) 1234-5678'), '523312345678');
    assert.equal(loyaltyPhone('1234'), null);
  });
  it('codes avoid ambiguous characters', () => {
    for (let i = 0; i < 20; i++) assert.match(makeLoyaltyCode(), /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });
});
