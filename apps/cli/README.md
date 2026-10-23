# mcid-cli

The MCID command-line client. Authenticate once with Discord and manage projects,
Discord servers, sync, members, permissions, admin access, ops monitoring, and Inbound Webhooks
directly from your terminal.

Includes an interactive zero-dependency terminal UI launcher (arrow-key navigation) inspired by GLMproxy,
plus scriptable output (`--json`, `-q`, `-o csv`, `--yes`) designed for automation and CI.

## Install

Requires Node.js 20 or newer (Node.js 22+ recommended).

```bash
npm install --global mcid-cli
mcid --help
```

The package installs two commands, `mcid-cli` and its short alias `mcid`. Both run the same binary.

## Interactive TUI Launcher

Running `mcid` with no arguments in an interactive terminal launches the zero-dependency TUI menu:

```bash
mcid
```

Navigate with arrow keys and press **Enter** to inspect projects, run doctor checks, monitor sync, or query members.

## Top 10 Most Useful Commands

1. **System Health & Sync Status:**
   ```bash
   mcid status
   ```
2. **Setup Diagnostics & Doctor:**
   ```bash
   mcid doctor
   ```
3. **Manage Projects & Generate Keys:**
   ```bash
   mcid project list
   mcid project create --name "My Club App" --redirect-uri http://localhost:3000/callback
   ```
4. **Trigger Live Discord Server Sync:**
   ```bash
   mcid sync run --wait
   ```
5. **Inspect Members & Roles:**
   ```bash
   mcid member get @adel
   mcid member permissions @adel
   ```
6. **Role Permissions with Impact Previews:**
   ```bash
   mcid role permissions add "Developer" 1 2 --dry-run
   ```
7. **Explain Effective Admin Access:**
   ```bash
   mcid access explain @member
   ```
8. **Test Webhook Signing & Submissions:**
   ```bash
   mcid webhook send contact-form --example
   mcid webhook watch contact-form
   ```
9. **Developer SSO End-to-End Test:**
   ```bash
   mcid dev sso --project "My Club App"
   ```
10. **Open Dashboard Page in Browser:**
    ```bash
    mcid open project my-project-id
    ```

## Standard Grammar & Scriptability

Every command group follows the grammar:
`mcid <noun> <verb> [args] [flags]`

- Singular nouns: `project`, `server`, `member`, `role`, `access`, `webhook`, `sync`, `audit`, `stats`, `settings`, `dev`.
- Standard verbs: `list` (alias `ls`), `get`, `create`, `update`, `delete` (alias `rm`).
- Universal flags:
  - `--profile <name>`: Target configuration profile.
  - `--json`: Machine-readable raw JSON output.
  - `-o, --output table|json|csv`: Output format.
  - `-q, --quiet`: Print only IDs for piping.
  - `--yes`: Skip confirmation prompts in scripts.
  - `--no-color`: Disable ANSI color formatting.
- CI support: Set `MCID_TOKEN` and `MCID_API_URL` to authenticate non-interactively without running `login`.

## Security & Secrets Storage

- Session tokens and webhook signing secrets are encrypted with AES-256-GCM.
- The encryption key is secured in your operating system's keychain, falling back to a `0600` key file in `~/.mcid-cli/`.
- Secrets are never printed in plain text unless `--reveal` is explicitly supplied.

## Develop

```bash
pnpm install
pnpm --filter mcid-cli dev -- --help
pnpm turbo run lint typecheck test --filter=mcid-cli
```
