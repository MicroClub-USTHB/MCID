/**
 * Deterministically serializes any JSON value by recursively sorting object keys.
 * Ensures identical objects produce identical hashes regardless of key insertion order.
 */
export function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return '';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => stableStringify(item)).join(',') + ']';
  }
  const record = obj as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  return (
    '{' +
    sortedKeys
      .map((k) => JSON.stringify(k) + ':' + stableStringify(record[k]))
      .join(',') +
    '}'
  );
}
