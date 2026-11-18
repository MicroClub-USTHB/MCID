/**
 * Builds an example payload that would pass Layer-2 validation for a schema.
 *
 * Steps and fields are evaluated in order against the example accumulated so
 * far, so a branch selected earlier (say `status: "student"`) pulls in the
 * fields that branch requires. Each step is nested under its key, matching the
 * shape `validatePayload` accepts for stepped schemas.
 */
import {
  Field,
  FormSchema,
  ROOT_STEP_KEY,
  normalizeSchema,
} from './form-schema.types';
import { evaluateCondition } from './condition.evaluator';

/** A value cut or padded to sit inside the field's declared length bounds. */
function fitLength(value: string, min?: number, max?: number): string {
  const padded = min !== undefined ? value.padEnd(min, 'x') : value;
  return max !== undefined ? padded.slice(0, max) : padded;
}

/** `fallback`, unless the declared bounds exclude it. */
function fitDate(fallback: string, min?: string, max?: string): string {
  if (min !== undefined) return min;
  return max !== undefined && Date.parse(max) < Date.parse(fallback)
    ? max
    : fallback;
}

function exampleNumber(field: Field & { type: 'number' }): number {
  if (field.min !== undefined) {
    return field.integer ? Math.ceil(field.min) : field.min;
  }
  const fallback = field.integer ? 42 : 42.5;
  if (field.max === undefined || field.max >= fallback) return fallback;
  return field.integer ? Math.floor(field.max) : field.max;
}

/** Shaped like a real file id; the caller swaps in one from an upload. */
const EXAMPLE_FILE_ID = '3f1c0a7e-9b2d-4c1a-8e5f-0a1b2c3d4e5f';

/**
 * `root` is the example built so far, which nested conditions are evaluated
 * against — the same paths a real submission would resolve. `item` is the
 * array entry being built, which `./` references read; `isItem` marks `field`
 * as that entry itself (an array element), which starts a new `./` scope.
 */
function exampleFor(
  field: Field,
  root: Record<string, unknown>,
  item?: Record<string, unknown>,
  isItem = false,
): unknown {
  switch (field.type) {
    case 'string':
      return field.pattern
        ? `<matching ${field.pattern}>`
        : fitLength('example', field.minLength, field.maxLength);
    case 'text':
      return fitLength('A longer piece of text.', undefined, field.maxLength);
    case 'number':
      return exampleNumber(field);
    case 'boolean':
      return true;
    case 'email':
      return field.allowedDomains?.length
        ? `someone@${field.allowedDomains[0]}`
        : 'someone@example.com';
    case 'url':
      return 'https://example.com';
    case 'phone':
      return '+213 555 123 456';
    case 'date':
      return fitDate('2026-01-31', field.min, field.max);
    case 'datetime':
      return fitDate('2026-01-31T09:00:00Z', field.min, field.max);
    case 'enum':
      return field.options[0]?.value ?? 'option';
    case 'multi_enum':
      return field.options.slice(0, field.minSelected ?? 1).map((o) => o.value);
    case 'object': {
      const out: Record<string, unknown> = {};
      fillExample(field.fields, out, root, isItem ? out : item);
      return out;
    }
    case 'array': {
      const count = field.minItems && field.minItems > 0 ? field.minItems : 1;
      return Array.from({ length: Math.min(count, 2) }, () =>
        exampleFor(field.item, root, item, true),
      );
    }
    case 'file':
      return { fileId: EXAMPLE_FILE_ID };
    case 'files':
      return [{ fileId: EXAMPLE_FILE_ID }];
    case 'json':
      return { any: 'json', under: field.maxBytes };
    default:
      return null;
  }
}

/**
 * Fills `target` field by field. A conditional field is included only when
 * the example built so far actually satisfies its condition — otherwise the
 * example would not validate, and the first thing a developer copies would
 * return 422.
 */
function fillExample(
  fields: Field[],
  target: Record<string, unknown>,
  root: Record<string, unknown>,
  item?: Record<string, unknown>,
): void {
  for (const field of fields) {
    if (field.condition && !evaluateCondition(field.condition, root, item)) {
      continue;
    }
    if (field.type === 'object') {
      // Attached before it is filled, so its own children can reference
      // each other by path.
      const child: Record<string, unknown> = {};
      target[field.key] = child;
      fillExample(field.fields, child, root, item);
    } else {
      target[field.key] = exampleFor(field, root, item);
    }
  }
}

/**
 * Builds a payload that would genuinely pass validation for this schema.
 *
 * Steps and fields are evaluated in order against the example accumulated so
 * far, so a branch selected earlier (say `status: "student"`) pulls in the
 * fields that branch requires.
 */
export function buildExamplePayload(
  schema: FormSchema,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const step of normalizeSchema(schema).steps) {
    if (step.condition && !evaluateCondition(step.condition, out)) continue;

    if (step.key === ROOT_STEP_KEY) {
      fillExample(step.fields, out, out);
      continue;
    }
    const stepOut: Record<string, unknown> = {};
    out[step.key] = stepOut;
    fillExample(step.fields, stepOut, out);
  }

  return out;
}
