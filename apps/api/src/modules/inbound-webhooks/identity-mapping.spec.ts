import { readPayloadPath } from './identity-mapping';

describe('readPayloadPath', () => {
  const payload = { profile: { github: 'octo', n: 1 }, flat: 'x' };

  it('reads flat and nested paths', () => {
    expect(readPayloadPath(payload, 'flat')).toBe('x');
    expect(readPayloadPath(payload, 'profile.github')).toBe('octo');
  });

  it('returns undefined when any hop is missing or not an object', () => {
    expect(readPayloadPath(payload, 'nope.github')).toBeUndefined();
    expect(readPayloadPath(payload, 'flat.deeper')).toBeUndefined();
  });
});
