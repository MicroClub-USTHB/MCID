# Issue #228: CLI foundation — closure plan

Status: planning; not ready to close. Issue: https://github.com/MicroClub-USTHB/MCID/issues/228

## Baseline and scope

Audit against upstream `dev` at `ff74356` (2026-11-17), not this branch's older starting tree. PR #237 implemented the initial CLI; PR #256 subsequently merged much of its follow-up. Do not reimplement those changes or treat the issue comment on #228 as a current checklist without verifying it. Recheck upstream `dev` before implementation.

The branch was merged with upstream `dev` at `ff74356`; inspect its diff **against upstream `dev`**, not just against the fork's older `main`. The histories diverge: do not reset or force-push. The PR should target upstream `dev`; its diff must contain only #228 work. Verify repository permissions and the base before opening it.

Issue #236 is a separate umbrella/release issue and needs a separate PR/session after #228 and the other dependent issues. No release, tag, publish, or issue closure is authorized by this plan alone.

## Evidence and outstanding audit

| Area | Evidence on upstream `dev` | Closure work |
| --- | --- | --- |
| Foundation | `lib/client.ts`, `output.ts`, `confirm.ts`, `resolver.ts` and tests exist; package provides both binaries. | Audit every command against the actual issue contract and document justified exceptions rather than assuming helpers are used everywhere. |
| Lists | #256 added paging to several lists. This branch fixes `role list` JSON paging and `sync logs` paging against the server API, including `--all`. `sync logs`, `webhook list` and `discord-webhook list` lack `-o`. | Inventory all list commands, their API pagination shapes and supported formats. Ensure pagination is honored in every format, including JSON; use server pagination where available, avoid truncation or duplicate rows. |
| Help/discovery | `lib/examples.test.ts` checks two examples per visible leaf and validates flags. #256 added a getting-started screen, hidden compatibility aliases and `doctor --json`. | Run the tests and exercise the packaged binary; extend tests to execute representative examples and invalid/non-TTY paths, not just inspect command metadata. |
| Client | Several command modules still call `fetch` directly, including `dev`, `doctor`, `member` and webhook submission. | Audit authentication modes, timeouts, retries and redaction; centralize common transport without changing project-key, token, raw-body HMAC, public-health or export semantics. |
| Secrets | `project create --json` explicitly prints the one-time key even without `--reveal`, contrary to #228's stated rule. Masking it without an alternative would irretrievably lose the key. | Resolve this behavior with maintainers before claiming acceptance: define an explicit, safe one-time credential handoff, failure behavior and backward compatibility; add tests for JSON, TTY, non-TTY, errors and logs. Do not silently change it. |
| Interactive and automation | Shared prompts exist; not every required argument necessarily uses them. Color state in `tui.ts` is based on stdout. | Inventory commands and test TTY/non-TTY prompts and cancellation, required mutation profiles, confirmations, `NO_COLOR` and output streams. Preserve no-prompt behavior in automation. |
| Generated types | CI checks `apps/cli/src/generated/api.d.ts` against OpenAPI; the issue names a different path. | Use the repository's existing generated path and freshness check; document this as an implementation choice, not a missing feature. |

The original issue also requires consistent aliases, JSON/CSV/quiet output, name and ID resolution, main-server defaults, exit codes, error hints, environment-token precedence, command help and conventions documentation. Inventory these explicitly; the table above is not proof that other criteria pass. Verify error output never leaks credentials and that destructive commands require confirmation or `--yes` without hanging on pipes.

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

## Follow-on: #236

After #228 and #229–#235 have individually met their acceptance criteria, audit the current docs, quickstart, README, changelog, supported Node version and release readiness against #236. Release tagging, GitHub release and npm publication require explicit authorization and access; a code PR alone cannot prove those operational steps happened.
