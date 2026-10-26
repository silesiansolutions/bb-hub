import { clientKey } from './origin.guard';

describe('clientKey', () => {
  it('trusts the forwarded client address only next to the right origin secret', () => {
    expect(clientKey({ 'x-origin-secret': 's3cret', 'x-client-ip': '203.0.113.1', 'cf-connecting-ip': '198.18.0.1' }, '10.0.0.1', 's3cret')).toBe('203.0.113.1');
    expect(clientKey({ 'x-origin-secret': 'wrong!', 'x-client-ip': '203.0.113.1', 'cf-connecting-ip': '198.18.0.1' }, '10.0.0.1', 's3cret')).toBe('198.18.0.1');
    expect(clientKey({ 'x-client-ip': '203.0.113.1' }, '10.0.0.1', undefined)).toBe('10.0.0.1');
    expect(clientKey({ 'x-origin-secret': 's3cret', 'x-client-ip': ['a', 'b'] }, '10.0.0.1', 's3cret')).toBe('10.0.0.1');
    expect(clientKey({}, undefined, 's3cret')).toBe('unknown');
  });
});
