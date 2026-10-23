import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './client.js';
import { resolveProject, resolveRole, resolveServer } from './resolver.js';

describe('resolver', () => {
  it('resolves project by exact ID', async () => {
    const fakeClient = {
      get: vi.fn().mockResolvedValue([
        { id: 'proj-1', name: 'Hackathon' },
        { id: 'proj-2', name: 'Website' },
      ]),
    } as unknown as ApiClient;

    const res = await resolveProject(fakeClient, 'proj-1');
    expect(res.id).toBe('proj-1');
    expect(res.name).toBe('Hackathon');
  });

  it('resolves project by case-insensitive name', async () => {
    const fakeClient = {
      get: vi.fn().mockResolvedValue([
        { id: 'proj-1', name: 'Hackathon' },
        { id: 'proj-2', name: 'Website' },
      ]),
    } as unknown as ApiClient;

    const res = await resolveProject(fakeClient, 'hackathon');
    expect(res.id).toBe('proj-1');
  });

  it('throws on ambiguous project matches', async () => {
    const fakeClient = {
      get: vi.fn().mockResolvedValue([
        { id: 'p1', name: 'Dev' },
        { id: 'p2', name: 'dev' },
      ]),
    } as unknown as ApiClient;

    await expect(resolveProject(fakeClient, 'dev')).rejects.toThrow('ambiguous');
  });

  it('throws NotFound when project does not exist', async () => {
    const fakeClient = {
      get: vi.fn().mockResolvedValue([]),
    } as unknown as ApiClient;

    await expect(resolveProject(fakeClient, 'missing')).rejects.toThrow('not found');
  });

  it('resolves server to main server by default when server identifier is omitted', async () => {
    const fakeClient = {
      get: vi.fn().mockResolvedValue([
        { id: 's1', name: 'Event Guild', isMain: false },
        { id: 's2', name: 'Micro Club Official', isMain: true },
      ]),
    } as unknown as ApiClient;

    const res = await resolveServer(fakeClient);
    expect(res.id).toBe('s2');
    expect(res.name).toBe('Micro Club Official');
  });

  it('reports a missing role instead of crashing on id-less global statistics', async () => {
    const fakeClient = {
      get: vi.fn().mockResolvedValue({
        scope: 'global',
        roles: [{ roleName: 'Lead', memberCount: 1 }],
      }),
    } as unknown as ApiClient;

    await expect(resolveRole(fakeClient, '', 'Lead')).rejects.toThrow('not found on server');
  });
});
