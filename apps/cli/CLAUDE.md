# mcid-cli

A developer CLI that lets an MCID admin authenticate once (via
browser-based Discord OAuth against MCID) and manage MCID resources, projects,
servers, sync, members, permissions, admin access, ops monitoring, and Inbound
Webhooks from the terminal.

## Architecture

mcid-cli is a thin client built on top of MCID's Admin and Project APIs.
It runs on pure Node.js (Node >= 20, recommended >= 22) with zero runtime dependencies
for its interactive terminal UI widgets.

- Commands are built with `commander`.
- Interactive prompts (`promptSelect`, `promptInput`, `promptNumber`, `promptConfirm`) use Node's `readline` in raw mode with ANSI cursor control (adapted from GLMproxy).
- Output helpers provide formatted tables, key-value cards, JSON, CSV, and quiet ID piping.
- HTTP requests go through a unified `ApiClient` that maps HTTP statuses to exit codes and provides helpful remediation hints.

## Command Groups

- `project`: Create apps, manage API keys, redirect URIs, server access permissions, and audit logs.
- `server`: Register Discord guilds, enable/disable servers, inspect channels and messages.
- `sync`: Trigger Discord guild synchronization with `--wait` live progress, inspect sync status and itemized changes.
- `member`: Search Discord members across servers, view roles and resolved permissions, export to CSV/JSON.
- `role`: View server roles and member counts, manage role permissions with impact previews, configure inheritance.
- `access`: Explain effective admin access levels (`none < read < write < manage`), manage role grants and member overrides.
- `webhook`: Create, inspect, test (`webhook send`), watch (`webhook watch`), and export inbound webhook forms.
- `status`: Comprehensive health check across API, database, Redis, Discord gateway, and server sync.
- `monitor`: Usage statistics, request volumes, error rates, and authentication failure logs.
- `audit`: Query and stream (`--follow`) admin action audit logs.
- `stats`: Member growth trends (with ASCII sparklines), role distribution, and cross-server overlap.
- `settings`: View effective system configuration, patch editable knobs, and reset to defaults.
- `dev`: Developer testing utilities: test project SSO flows end to end (`dev sso`), validate/refresh tokens, and test permissions.
- `doctor`: Run diagnostic checks on Node runtime, config permissions, keychain access, API connectivity, and active session.
- `completion`: Generate shell auto-completion for bash, zsh, and fish.
- `open`: Launch browser directly to matching MCID web dashboard views.

## Conventions

- Singular nouns: `project`, `server`, `member`, `role`, `access`, `webhook`, `sync`, `audit`, `stats`, `settings`, `dev`.
- Standard verbs: `list` (alias `ls`), `get`, `create`, `update`, `delete` (alias `rm`).
- Every command supports `--json`, `-q, --quiet`, and `-o, --output table|json|csv`.
- Non-interactive safety: Destructive actions require confirmation or `--yes`. In non-TTY environments without `--yes`, commands exit with code 64 (Usage).
- Resolvers: Names, slugs, or IDs are accepted. Discord members accept `@username` or snowflake ID. `--server` defaults to main guild.
- CI authentication: Supports `MCID_TOKEN` and `MCID_API_URL` environment variables.
- Exit codes are part of the contract: `0` completed (even when the answer is negative), `1` precheck failed, `2` rejected/aborted, `3` auth, `4` not found, `5` unexpected, `64` usage.

### Profiles and authentication

- `login` always requires an explicit `--profile`; it creates state and must not guess.
- Every other command resolves the active profile when `--profile` is omitted, and `--profile <name>` targets another deployment. Reads and writes follow the same rule; pass `--profile` in scripts that must not depend on the local active profile.
- Sessions are encrypted with the OS keychain (a `0600` key file is the fallback). `MCID_TOKEN` overrides the stored session for CI.
- The config lives at the platform config path (`MCID_CLI_CONFIG_PATH` overrides it for tests). Writes are atomic and `0600`; a config lock serialises concurrent commands.

### Secrets never leak

- API keys, session tokens, signing secrets and refresh tokens are never written in plaintext to logs, `--json` output or export files.
- Masked output is the default; `--reveal` is the explicit opt-in for a secret that would otherwise be unrecoverable (the rotated token pair, the API key returned once on create).
- `--print-curl` prints a placeholder API key unless `--reveal` is passed, and the printed signature is always a placeholder because signatures expire.
- Exports and generated `.env` files are written with mode `0600` and refuse to overwrite without `--force`.

### Schema rules live in @mcid/form-schema

- The CLI must not reimplement schema validation or example payload generation. `buildExamplePayload` and `validatePayload` come from `@mcid/form-schema`, the same code the API runs.
- Step payloads nest under `step.key`; enum options are `{ value, label }` and the payload carries `value`.
- When the schema language changes, update the shared package and both consumers together, and regenerate the API reference.

### Generated API types

- `pnpm --filter mcid-cli generate:api-types` regenerates `src/generated/api.d.ts` from `apps/api/openapi.json`. CI runs it and fails when the committed file is stale, so commit the regenerated file with any API change.
- Do not hand-edit generated files; ESLint and Prettier ignore them.
