import { stableStringify } from './stable-json.util';

describe('stableStringify', () => {
  it('should return empty string for null and undefined', () => {
    expect(stableStringify(null)).toBe('');
    expect(stableStringify(undefined)).toBe('');
  });

  it('should serialize primitives', () => {
    expect(stableStringify('hello')).toBe('"hello"');
    expect(stableStringify(42)).toBe('42');
    expect(stableStringify(true)).toBe('true');
  });

  it('should preserve array element order while stably serializing items', () => {
    expect(stableStringify([1, 2, 3])).toBe('[1,2,3]');
    expect(stableStringify([{ b: 2, a: 1 }, { d: 4, c: 3 }])).toBe(
      '[{"a":1,"b":2},{"c":3,"d":4}]',
    );
  });

  it('should serialize objects with deterministic sorted keys', () => {
    const objA = { z: 1, a: 2, m: 3 };
    const objB = { a: 2, m: 3, z: 1 };
    expect(stableStringify(objA)).toBe('{"a":2,"m":3,"z":1}');
    expect(stableStringify(objA)).toBe(stableStringify(objB));
  });

  it('should handle nested objects and arrays deterministically', () => {
    const complex1 = {
      role: 'admin',
      options: { timeout: 30, color: 'blue' },
      list: [{ y: 2, x: 1 }],
    };
    const complex2 = {
      list: [{ x: 1, y: 2 }],
      options: { color: 'blue', timeout: 30 },
      role: 'admin',
    };
    expect(stableStringify(complex1)).toBe(stableStringify(complex2));
  });
});
