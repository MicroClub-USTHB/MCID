# Issue #228: CLI foundation — closure plan

Status: in progress; not ready to close. Issue: https://github.com/MicroClub-USTHB/MCID/issues/228

## Baseline and scope

Audit against upstream `dev` at `ff74356` (2026-11-17), not this branch's older starting tree. PR #237 implemented the initial CLI; PR #256 subsequently merged much of its follow-up. Do not reimplement those changes or treat the issue comment on #228 as a current checklist without verifying it. Recheck upstream `dev` before implementation.

The branch was merged with upstream `dev` at `ff74356`; inspect its diff **against upstream `dev`**, not just against the fork's older `main`. The histories diverge: do not reset or force-push. The PR should target upstream `dev`; its diff must contain only #228 work. Verify repository permissions and the base before opening it.

Issue #236 is a separate umbrella/release issue and needs a separate PR/session after #228 and the other dependent issues. No release, tag, publish, or issue closure is authorized by this plan alone.

## Evidence and outstanding audit

| Area | Evidence on upstream `dev` | Closure work |
| --- | --- | --- |
| Foundation | `lib/client.ts`, `output.ts`, `confirm.ts`, `resolver.ts` and tests exist; package provides both binaries. | Audit every command against the actual issue contract and document justified exceptions rather than assuming helpers are used everywhere. |
| Lists | #256 added paging to several lists. This branch fixes role JSON, sync-log and cross-server member pagination; adds CSV to sync logs and both webhook lists; validates format choices for seven list commands. | Inventory remaining list commands, their API pagination shapes and formats. Ensure pagination is honored in every format, including JSON; use server pagination where available, avoid truncation or duplicate rows. |
| Help/discovery | `lib/examples.test.ts` checks two examples per visible leaf and validates flags. #256 added a getting-started screen, hidden compatibility aliases and `doctor --json`. | Run the tests and exercise the packaged binary; extend tests to execute representative examples and invalid/non-TTY paths, not just inspect command metadata. |
| Client | Several command modules still call `fetch` directly, including `dev`, `doctor`, `member` and webhook submission. | Audit authentication modes, timeouts, retries and redaction; centralize common transport without changing project-key, token, raw-body HMAC, public-health or export semantics. |
| Secrets | The user approved requiring `--reveal` for `project create --json`. The command rejects missing opt-in before creating a project, because the API key is only returned once. | Test other one-time credential flows and TTY, non-TTY, error and logging behavior; document any additional exceptions before claiming acceptance. |
| Interactive and automation | Shared prompts exist; not every required argument necessarily uses them. Color state in `tui.ts` is based on stdout. | Inventory commands and test TTY/non-TTY prompts and cancellation, required mutation profiles, confirmations, `NO_COLOR` and output streams. Preserve no-prompt behavior in automation. |
| Generated types | CI checks `apps/cli/src/generated/api.d.ts` against OpenAPI; the issue names a different path. | Use the repository's existing generated path and freshness check; document this as an implementation choice, not a missing feature. |

The original issue also requires consistent aliases, JSON/CSV/quiet output, name and ID resolution, main-server defaults, exit codes, error hints, environment-token precedence, command help and conventions documentation. Inventory these explicitly; the table above is not proof that other criteria pass. Verify error output never leaks credentials and that destructive commands require confirmation or `--yes` without hanging on pipes.

## Review-driven implementation plan

1. **One-time credential safety:** require explicit `--reveal` before a token refresh request; the new credentials must still be returned when the server has invalidated the old ones. Test both nested and hidden aliases, JSON and human output, and verify no refresh request is made without consent. Do not redact a newly rotated credential after the operation.
2. **Project creation partial failures:** validate `--env-out` before creating the project, and handle it in JSON as well as human mode. Always deliver the one-time key even if later setup or file writing fails, emit a useful non-secret diagnostic, and return nonzero for partial failure. Test redirect/grant failures, missing opt-in, output-file failures, and successful JSON with `--env-out`. Never retry project creation automatically.
3. **Secret files:** existing files need actual owner-only permissions, not merely `writeFile`'s creation mode; avoid symlinks and unsafe overwrite races. If safe cross-platform handling is not demonstrated, fail closed and record the limitation rather than claim that mode bits protect Windows or rewrite unrelated files.
4. **JSON redaction:** audit DTOs and preserve non-secret permission `key` fields while masking every length of actual secrets. Avoid a generic policy that either leaks unknown secret fields or corrupts valid data; add nested and short-value tests before changing behavior. If the schema cannot distinguish fields safely, make this a closure blocker.
5. **List and foundation audit:** inventory all visible list commands and API pagination, then cover actual command parsing, output, TTY behavior, authentication, aliases, and profile requirements. Do not bolt pagination onto streaming commands or silently change destructive confirmation behavior. Test JSON shape changes as explicit compatibility changes.
6. Run targeted tests after each change, CLI coverage/lint/typecheck/build, docs tests and repository checks sequentially to avoid the earlier resource exhaustion. Re-review all modified paths and record exact incomplete checks and residual risks.

### Failure-mode review

- An early error after creation can hide the only key; once a project exists, always return its key before reporting failure, without logging it to stderr or debug output.
- A destination can change between preflight and write. Recheck at write time and use safe file operations; preflight alone is not a guarantee.
- A JSON result must stay parseable even on partial failure. Warnings go to stderr and nonzero status signals incomplete setup.
- Token refresh can revoke the previous session. Validate opt-in before any network request and preserve the unmasked response only after consent.
- Whole-repository checks are resource intensive and lint can auto-fix files. Run with limited concurrency, inspect status afterwards, and never report incomplete checks as passing.
- File identity and content are rechecked before writing, but this is not a cross-process lock: a concurrent writer may still modify the file after the check. A write error after truncation may leave a partial file. POSIX mode checks do not verify Windows ACLs; do not claim these safeguards eliminate all filesystem races or secure Windows files automatically.
- Project-create env output now rejects hard links at preflight and write time; cross-process races remain. Project-create post-creation setup diagnostics no longer echo server-provided error text; other commands and pre-creation failures still need a secret/error audit.
- Report exports now use exclusive creation without `--force`; forced overwrites reject symlinks, hard links and existing files that are not POSIX mode 0600. This is a compatibility change. Windows ACLs are not checked, and concurrent changes or partial writes remain possible; do not claim universal filesystem safety.
- Shared client debug logging removes query strings and avoids propagating network error text, but path components and server error bodies still need a broader sensitive-data audit.
- The generic JSON redactor masks fields by name; unexpected credential names and other public fields called `key` still need a DTO-by-DTO audit. The role-permission JSON path explicitly projects its documented public fields.

### Current verification (partial implementation)

- Earlier sequential workspace lint, typecheck and test: 15 tasks passed, with cached results; web lint reported five warnings. Web tests: 1,405 passed; API tests: 1,468 passed. These results predate the latest edits and upstream changes.
- Latest CLI coverage run against the current upstream baseline: 49 files, 373 tests passed; statement coverage 60.33%. CLI lint, typecheck and build passed. Built executable help and token-refresh help were smoke tested earlier; this is not the full TTY/non-TTY smoke matrix.
- Earlier workspace build failed at web build because the restricted environment cannot fetch Google Fonts. A separate build excluding web passed (four tasks). This does not establish that the web build passes.
- Web docs tests excluding `source-truth.test.ts`: 628 passed. The previous full run had 3 failures because the pre-existing working-tree change in `build/local-setup.mdx` omits documented API environment variables. Preserve that unrelated change and resolve it separately; do not report the full suite as passing.
- Issue-wide acceptance matrix, universal output/pagination behavior, mutation profiles, shared transport, interactive behavior, filesystem edge cases and secret/error audit remain incomplete. Do not close #228 yet.

## Implementation sequence

1. Create an acceptance matrix from every bullet in #228. For each visible command record options, output shapes, resolver, auth mode, mutation confirmation, TTY behavior, and existing test evidence. Record any requirements that are incompatible with the API or current product behavior as decisions, not silent omissions.
2. Add failing tests for confirmed gaps against the actual Commander tree and fake server. Include pagination boundaries, invalid inputs, each output mode, secret redaction, no-TTY behavior and representative interactive tests. Add a built-bin smoke test that exercises both aliases and verifies exit codes.
3. Fix shared primitives first, then migrate commands in small reviewed groups. Preserve raw response and streaming/export semantics where applicable; validate format conflicts rather than silently choosing one. Do not expose secrets via JSON, stderr, debug, fixtures, or snapshots.
4. Update CLI conventions and command help/docs to match the resulting behavior. Verify generated OpenAPI types only if affected; do not regenerate unrelated artifacts.
5. Run the matrix again, record exact commands and results in the PR, and obtain maintainer decisions for any unavoidable issue-text changes before claiming closure.

## Verification and closure gate

- CLI unit and command-level tests, including coverage and new regression cases; lint, typecheck and build.
- Repository `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and API-doc/type freshness checks as applicable. Record environment-dependent failures accurately, including unavailable services or external credentials.
- Exercise the built executable in a non-TTY and a TTY, including no-argument help, list output, errors, destructive confirmation and no-color. Use fake services and synthetic credentials; never run destructive actions against a real environment.
- Compare the PR against updated upstream `dev`; confirm no #236 release work or unrelated files. Include the completed acceptance matrix, deviations and tests in the PR description.
- Use `Closes #228` only when all requirements are demonstrated or maintainers explicitly agree to amended scope. Otherwise use `Refs #228` and list blockers. Do not close #236 as a side effect.

## PR description note for #228

When opening the #228 PR, explain these breaking changes: `project create --json` and `dev token refresh` require `--reveal` and fail before their requests without it. The API returns the credentials only once; silently masking them would lose them, while printing them without explicit consent exposes secrets. Existing scripts must add `--reveal` and handle the resulting secrets securely. Project creation now returns nonzero on partial setup failure but still prints the one-time key; JSON callers must consume stdout even on error. Existing POSIX env files must already be mode `0600` and symlinks are refused. Mention #228 in the PR body; use `Closes #228` only if the closure gate above is met, otherwise use `Refs #228`.

## Follow-on: #236

After #228 and #229–#235 have individually met their acceptance criteria, audit the current docs, quickstart, README, changelog, supported Node version and release readiness against #236. Release tagging, GitHub release and npm publication require explicit authorization and access; a code PR alone cannot prove those operational steps happened.
