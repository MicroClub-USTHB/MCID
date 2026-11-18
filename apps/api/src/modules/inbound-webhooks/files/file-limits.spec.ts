import type { FormSchema } from '@mcid/form-schema';
import { fileLimits } from './file-limits';

const file = (accept: string[], maxSizeBytes: number) =>
  ({ key: 'f', type: 'file', accept, maxSizeBytes }) as never;

describe('fileLimits', () => {
  it('is null when the schema has no file field', () => {
    const schema = {
      version: 1,
      fields: [{ key: 'name', type: 'string' }],
    } as FormSchema;
    expect(fileLimits(schema)).toBeNull();
  });

  it('unions the accepted types and takes the largest size, across steps and nesting', () => {
    const schema = {
      version: 1,
      steps: [
        { key: 'a', fields: [file(['application/pdf'], 1000)] },
        {
          key: 'b',
          fields: [
            {
              key: 'docs',
              type: 'array',
              maxItems: 3,
              item: file(['image/png'], 5000),
            },
            {
              key: 'obj',
              type: 'object',
              fields: [
                {
                  key: 'many',
                  type: 'files',
                  maxCount: 2,
                  accept: ['image/png', 'image/jpeg'],
                  maxSizeBytes: 200,
                },
              ],
            },
          ],
        },
      ],
    } as FormSchema;

    const limits = fileLimits(schema);
    expect([...limits!.accept].sort()).toEqual([
      'application/pdf',
      'image/jpeg',
      'image/png',
    ]);
    expect(limits!.maxSizeBytes).toBe(5000);
  });
});
