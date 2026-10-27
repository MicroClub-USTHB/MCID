/**
 * The Layer-2 payload validator lives in `@mcid/form-schema`, so the API, the
 * CLI and the docs generator validate a submission with exactly the same code.
 *
 * This module is kept as the API's import path so callers (and specs) do not
 * have to change, but it holds no rules of its own.
 */
export {
  validatePayload,
  type FieldError,
  type FileMeta,
  type PayloadValidationResult,
  type ValidateOptions,
} from '@mcid/form-schema';
