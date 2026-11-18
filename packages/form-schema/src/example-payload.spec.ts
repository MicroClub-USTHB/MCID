import { buildExamplePayload } from './example-payload';
import { validatePayload } from './payload.validator';
import type { FormSchema } from './form-schema.types';

const opts = { rejectUnknownFields: true };

describe('buildExamplePayload', () => {
  it('nests each step under its key, the shape the validator reads', () => {
    const schema: FormSchema = {
      version: 1,
      steps: [
        {
          key: 'contact',
          fields: [
            { key: 'message', type: 'string', required: true },
            {
              key: 'topic',
              type: 'enum',
              required: true,
              options: [{ value: 'support' }],
            },
          ],
        },
      ],
    };

    const example = buildExamplePayload(schema) as Record<
      string,
      Record<string, unknown>
    >;

    expect(Object.keys(example)).toEqual(['contact']);
    expect(example['contact']).toMatchObject({ topic: 'support' });
    expect(validatePayload(schema, example, opts).ok).toBe(true);
  });

  it('includes the fields the selected branch makes required', () => {
    const schema: FormSchema = {
      version: 1,
      steps: [
        {
          key: 'apply',
          fields: [
            {
              key: 'status',
              type: 'enum',
              required: true,
              options: [{ value: 'student' }, { value: 'worker' }],
            },
            {
              key: 'studentId',
              type: 'string',
              required: true,
              condition: { op: 'eq', field: 'apply.status', value: 'student' },
            },
            {
              key: 'employer',
              type: 'string',
              required: true,
              condition: { op: 'eq', field: 'apply.status', value: 'worker' },
            },
          ],
        },
      ],
    };

    const example = buildExamplePayload(schema) as Record<
      string,
      Record<string, unknown>
    >;

    expect(example['apply']).toMatchObject({ status: 'student' });
    expect(example['apply']!['studentId']).toBeTypeOf('string');
    expect(example['apply']!['employer']).toBeUndefined();
    expect(validatePayload(schema, example, opts).ok).toBe(true);
  });

  it('builds object and array fields with the item shape the schema declares', () => {
    const schema: FormSchema = {
      version: 1,
      steps: [
        {
          key: 'profile',
          fields: [
            {
              key: 'person',
              type: 'object',
              required: true,
              fields: [{ key: 'name', type: 'string', required: true }],
            },
            {
              key: 'links',
              type: 'array',
              required: true,
              minItems: 2,
              maxItems: 3,
              item: { key: 'link', type: 'url', required: true },
            },
          ],
        },
      ],
    };

    const example = buildExamplePayload(schema) as Record<
      string,
      Record<string, unknown>
    >;

    expect(example['profile']!['person']).toMatchObject({
      name: expect.any(String),
    });
    expect(example['profile']!['links']).toHaveLength(2);
    expect(validatePayload(schema, example, opts).ok).toBe(true);
  });

  it('keeps a flat schema flat', () => {
    const schema: FormSchema = {
      version: 1,
      fields: [{ key: 'name', type: 'string', required: true }],
    };

    expect(buildExamplePayload(schema)).toMatchObject({
      name: expect.any(String),
    });
  });
});
