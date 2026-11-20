// Smoke tests for the shipped bundle (the unit suite exercises TypeScript source).
// Run after `pnpm --filter mcid-cli build`: `pnpm --filter mcid-cli test:bin`.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import test from 'node:test';

const root = dirname(fileURLToPath(import.meta.url));
const bin = resolve(root, 'bin/mcid-cli.js');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

function run(args) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd: root,
    encoding: 'utf8',
    // Force the non-interactive path so no test can block on a TTY prompt,
    // and supply synthetic credentials so usage checks are reached.
    env: {
      ...process.env,
      CI: '1',
      MCID_TOKEN: 'test-session-token',
      MCID_API_URL: 'http://localhost:3000',
    },
  });
}

test('package ships both bin aliases pointing at the bundled executable', () => {
  assert.equal(pkg.bin['mcid-cli'], './bin/mcid-cli.js');
  assert.equal(pkg.bin.mcid, './bin/mcid-cli.js');
  assert.ok(existsSync(bin), 'build the CLI first (pnpm --filter mcid-cli build)');
});

test('--help prints the usage screen and exits 0', () => {
  const result = run(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage: mcid-cli/);
});

test('no arguments prints the getting-started screen and exits 0', () => {
  const result = run([]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Getting started/);
  assert.match(result.stdout, /mcid-cli login --profile/);
});

test('an unknown command exits with the usage code (64)', () => {
  const result = run(['definitely-not-a-command']);
  assert.equal(result.status, 64);
  assert.match(result.stderr, /unknown command/i);
});

test('a missing required argument exits with the usage code and names the flag', () => {
  const result = run(['discord-webhook', 'list']);
  assert.equal(result.status, 64);
  assert.match(result.stderr, /--project <project>/);
});
