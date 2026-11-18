import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from './client.js';
import { ExitCode } from '../errors.js';

const session = {
  profileName: 'test',
  baseUrl: 'http://localhost:3000',
  token: 'token',
};

function stubFetch(response: Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MCID_DEBUG;
});

describe('ApiClient', () => {
  it('reports the Retry-After window on 429 instead of a generic failure', async () => {
    stubFetch(
      new Response(JSON.stringify({ message: 'Too many requests' }), {
        status: 429,
        headers: { 'content-type': 'application/json', 'retry-after': '42' },
      }),
    );

    const client = new ApiClient(session);
    await expect(client.request('GET', '/admin/projects')).rejects.toMatchObject({
      exitCode: ExitCode.Rejected,
      message: expect.stringContaining('retry after 42s'),
    });
  });

  it('still explains a 429 that carries no Retry-After header', async () => {
    stubFetch(new Response('', { status: 429 }));

    const client = new ApiClient(session);
    await expect(client.request('GET', '/admin/projects')).rejects.toMatchObject({
      message: expect.stringContaining('rate-limiting'),
    });
  });

  it('prints request timings on stderr when debug is on', async () => {
    stubFetch(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const client = new ApiClient({ ...session, profileName: 'test' }, { debug: true });
    await client.request('GET', '/admin/projects');

    expect(write.mock.calls.map((call) => String(call[0])).join('')).toContain(
      '[debug] GET /admin/projects -> 200',
    );
    write.mockRestore();
  });
});
