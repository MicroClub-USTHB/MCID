# Changelog

All notable changes to mcid-cli are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-23

MCID CLI 1.0 covers the full MCID MVP directly from the terminal.

### Added

- **Foundation & Grammar:**
  - Zero-dependency interactive terminal UI launcher with arrow-key navigation (inspired by GLMproxy).
  - Consistent grammar: `mcid <noun> <verb> [args] [flags]` with singular nouns and standard verbs (`list`/`ls`, `get`, `create`, `update`, `delete`/`rm`).
  - Output formats: formatted tables with dimmed IDs, key-value cards, JSON (`--json`), CSV (`-o csv`), and quiet ID output (`-q, --quiet`).
  - Resource resolvers: match by ID, slug, or case-insensitive name; members match `@username` or Discord snowflake ID; `--server` defaults to main server.
  - Interactive confirmations for destructive actions; `--yes` skips confirmation. Non-TTY environments exit with code 64 unless `--yes` is passed.
  - CI authentication via `MCID_TOKEN` and `MCID_API_URL` environment variables.
  - Diagnostics command `mcid doctor` testing Node version, config permissions, keychain crypto store, and API health.
  - Autocompletion scripts for `bash`, `zsh`, and `fish` via `mcid completion <shell>`.
  - Browser dashboard launcher `mcid open [area] [id]`.

- **Project Management:**
  - `project list`, `project get`, `project create` with interactive wizard and `.env` block generation.
  - `project update`, `project delete`.
  - `project redirect-uri list|add|remove`.
  - `project key show`, `project key rotate`, `project key revoke`, `project key restore`.
  - `project access list|grant|revoke|matrix|log`.

- **Servers & Sync:**
  - `server list`, `server get`, `server add`, `server update`, `server enable`, `server disable`, `server delete`.
  - `server channels`, `server channel`.
  - `sync run` with `--wait` live progress indicator and counters.
  - `sync status`, `sync logs`, `sync changes`.

- **Members, Roles & Permissions:**
  - `member list`, `member list --cross-server`, `member get`, `member permissions`, `member export`.
  - `role list`, `role get`, `role permissions list|add|remove` with impact previews.
  - `role inheritance list|set`.

- **Admin Access:**
  - `access catalog`: resources and levels.
  - `access explain <member>`: detailed access levels and sources.
  - `access roles`: role-by-resource matrix.
  - `access role-set`, `access member-get`, `access member-set`, `access member-unset`, `access overrides`.

- **Inbound Webhooks:**
  - `webhook send` with local schema check, HMAC-SHA256 signature, `--example`, and `--print-curl`.
  - `webhook submissions`, `webhook submission`, `webhook submissions-export`.
  - `webhook watch`: live submission streaming (`tail -f` and NDJSON).
  - `webhook docs`: generate and export integration markdown docs.
  - `webhook settings get|set`, `webhook readable`.
  - `schema preview`: server-side validation and docs preview.

- **Ops & Monitoring:**
  - `status`: one-screen health check for API, DB, Redis, Discord, and server sync.
  - `monitor usage`, `monitor auth-failures`.
  - `audit list` with continuous streaming (`--follow`), `audit export`.
  - `stats members`, `stats growth` with terminal ASCII sparkline, `stats roles`, `stats servers`, `stats overlap`, `stats export`.
  - `settings get`, `settings set`, `settings reset`.
  - `discord-webhook list|get|delete`.

- **Dev Commands:**
  - `dev sso`: end-to-end SSO authorization flow testing with local PKCE listener and token exchange.
  - `dev token-validate`, `dev token-refresh`.
  - `dev check`: check permissions for member using project API key.
  - `dev env`: print or write project environment block.

## [0.1.0] - 2026-10-16

First release. The CLI covers MCID Inbound Webhooks: logging in as an admin, writing and pre-checking FormSchema files, and managing webhooks.

### Added

- `mcid-cli login` and `logout`: browser-based Discord login with PKCE, one session per named profile (`--profile`).
- `--base-url` takes the MCID origin; a trailing `/api` is dropped, so the API URL works too.
- `mcid-cli whoami`, `profile` and `config` commands to inspect and manage profiles.
- `mcid-cli schema init` to scaffold a FormSchema file from the admin panel's templates, and `schema validate` to check it offline with the same validator the MCID API runs (`@mcid/form-schema`).
- Custom validation rules ("house rules") that extend the built-in pre-check, per project or global.
- `mcid-cli webhook create`, `list`, `get`, `update` and `delete`; `update` accepts `--name`, `--schema`, `--active` and `--inactive`.
- `mcid-cli webhook roles set` to choose which Discord roles can read submissions, and `webhook rotate-secret` to issue a new signing secret.
- `mcid-cli webhook secret get [id|slug]` to read back a signing secret, with `--reveal`. The CLI keeps an encrypted copy because MCID shows a secret only once.
- Local pre-check on `webhook create` and `webhook update --schema`: an invalid schema never reaches the server.
- Exit codes for scripting: `0` success, `1` local pre-check failed, `2` MCID rejected the request, `3` not logged in or not allowed, `4` not found, `5` unexpected or network error, `64` invalid command line.
- The `mcid` command as a shorter alias for `mcid-cli`.
- A guide to writing backend schemas (`docs/form-schema.md`) and one for custom rules (`docs/custom-rules.md`).

### Security

- Session tokens and webhook signing secrets are encrypted at rest with AES-256-GCM. The key lives in the OS keychain, or in a `0600` key file next to the config when no keychain is reachable.
- Each stored secret is decrypted only with the key that encrypted it and is bound to its config slot.
- The CLI fetches the encryption key before MCID issues a signing secret it never shows again, so a key failure cannot lose a secret.
- A locked keychain does not drop stored sessions.
- The session is sent only to `https` base URLs (`http` is allowed on localhost), never follows redirects, and the login link must be on `discord.com`.
- The login callback is checked against the OAuth state, and control characters are stripped from printed errors.
- Config writes are locked so parallel commands cannot lose secrets, and a profile that holds signing secrets cannot be pointed at another MCID.

[Unreleased]: https://github.com/MicroClub-USTHB/MCID/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/MicroClub-USTHB/MCID/releases/tag/v0.1.0
