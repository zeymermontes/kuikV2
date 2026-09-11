import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinPhone, phoneLooksValid, splitPhone } from '../lib/phone-countries';

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

test('other countries join through libphonenumber, with their own trunk and mobile prefixes', () => {
  assert.equal(joinPhone('AR', '011 15 5555 1234'), '+5491155551234');
  assert.equal(splitPhone('+5491155551234').iso, 'AR');
  assert.equal(joinPhone('ES', '600 111 222'), '+34600111222');
  assert.equal(joinPhone('CO', '310 123 4567'), '+573101234567');
  assert.equal(joinPhone('US', '212 555 0123'), '+12125550123');
  assert.equal(joinPhone('BR', '(11) 91234-5678'), '+5511912345678');
  assert.equal(joinPhone('GT', '5555 1234'), '+50255551234');
  // Unrecognised digits are still kept, dial code first.
  assert.equal(joinPhone('MX', '12'), '+5212');
  assert.equal(phoneLooksValid('MX', '6674315968'), true);
  assert.equal(phoneLooksValid('MX', '12'), false);
  assert.equal(phoneLooksValid('MX', ''), null);
});
