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
