import { describe, expect, it } from 'vitest';
import { ExitCode } from '../errors.js';
import { mapApiError } from './error-mapping.js';

describe('error-mapping', () => {
  it('maps 401 to Auth with login hint', () => {
    const err = mapApiError(401, {}, { profileName: 'test-profile' });
    expect(err.exitCode).toBe(ExitCode.Auth);
    expect(err.message).toContain('MCID rejected the session');
    expect(err.message).toContain('mcid-cli login --profile test-profile');
  });

  it('maps 403 to Auth with permission explanation hint', () => {
    const err = mapApiError(403, { message: 'requires write on projects' });
    expect(err.exitCode).toBe(ExitCode.Auth);
    expect(err.message).toContain('Access denied');
    expect(err.message).toContain('requires write on projects');
    expect(err.message).toContain('mcid-cli access explain');
  });

  it('maps 404 to NotFound with resource and identifier', () => {
    const err = mapApiError(404, {}, { resource: 'project', id: 'my-proj' });
    expect(err.exitCode).toBe(ExitCode.NotFound);
    expect(err.message).toContain('Not found: project "my-proj"');
  });

  it('maps 409 to Rejected with conflict details', () => {
    const err = mapApiError(409, { message: 'slug already exists' }, { resource: 'project' });
    expect(err.exitCode).toBe(ExitCode.Rejected);
    expect(err.message).toContain('Conflict');
    expect(err.message).toContain('slug already exists');
  });

  it('maps 400 validation error list to Rejected', () => {
    const err = mapApiError(
      400,
      { errors: [{ path: 'name', code: 'IS_STRING', message: 'must be string' }] },
      { resource: 'project' },
    );
    expect(err.exitCode).toBe(ExitCode.Rejected);
    expect(err.message).toContain('name IS_STRING must be string');
  });

  it('maps 429 to Unexpected with retryAfter', () => {
    const err = mapApiError(429, { retryAfter: 30 });
    expect(err.exitCode).toBe(ExitCode.Unexpected);
    expect(err.message).toContain('Rate limited');
    expect(err.message).toContain('retry in 30s');
  });
});
