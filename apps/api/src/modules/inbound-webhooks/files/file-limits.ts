import { normalizeSchema } from '@mcid/form-schema';
import type { Field, FormSchema } from '@mcid/form-schema';

export interface FileLimits {
  /** Every MIME type some file field of the webhook accepts. */
  accept: Set<string>;
  /** The largest `maxSizeBytes` of any file field. */
  maxSizeBytes: number;
}

/**
 * What an upload to this webhook may be. An upload is not tied to a field, so
 * it is checked against the union of the schema's file fields; the field that
 * later references it applies its own, stricter `accept` and `maxSizeBytes`.
 * Null when the schema has no file field: such a webhook takes no uploads.
 */
export function fileLimits(schema: FormSchema): FileLimits | null {
  const limits: FileLimits = { accept: new Set(), maxSizeBytes: 0 };
  let found = false;

  const visit = (field: Field): void => {
    if (field.type === 'file' || field.type === 'files') {
      found = true;
      field.accept.forEach((mime) => limits.accept.add(mime));
      limits.maxSizeBytes = Math.max(limits.maxSizeBytes, field.maxSizeBytes);
    } else if (field.type === 'object') {
      field.fields.forEach(visit);
    } else if (field.type === 'array') {
      visit(field.item);
    }
  };
  normalizeSchema(schema).steps.forEach((step) => step.fields.forEach(visit));

  return found ? limits : null;
}
