import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinPhone, splitPhone } from '../lib/phone-countries';

test('a stored E.164 number splits by its dial code, longest match first', () => {
  assert.deepEqual(splitPhone('+526621234567'), { iso: 'MX', national: '6621234567' });
  assert.deepEqual(splitPhone('+18095551234'), { iso: 'DO', national: '5551234' });
  assert.deepEqual(splitPhone('+12125551234'), { iso: 'US', national: '2125551234' });
  assert.deepEqual(splitPhone('+34600111222'), { iso: 'ES', national: '600111222' });
});

test('bare Mexican input loses the WhatsApp marker and old trunk prefixes', () => {
  assert.deepEqual(splitPhone('6674315968'), { iso: 'MX', national: '6674315968' });
  assert.deepEqual(splitPhone('5216674315968'), { iso: 'MX', national: '6674315968' });
  assert.deepEqual(splitPhone('+5216674315968'), { iso: 'MX', national: '6674315968' });
  assert.deepEqual(splitPhone('044 667 431 5968'), { iso: 'MX', national: '6674315968' });
  assert.deepEqual(splitPhone(''), { iso: 'MX', national: '' });
  assert.deepEqual(splitPhone(null), { iso: 'MX', national: '' });
});

test('the halves join back into E.164, or nothing', () => {
  assert.equal(joinPhone('MX', '667 431 5968'), '+526674315968');
  assert.equal(joinPhone('US', '(212) 555-1234'), '+12125551234');
  assert.equal(joinPhone('MX', ''), '');
  assert.equal(splitPhone(joinPhone('AR', '91155551234')).national, '91155551234');
});
