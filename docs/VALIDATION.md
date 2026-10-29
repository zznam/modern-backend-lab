# E2E validation and focused improvements

Validation date: October 30, 2026 (Asia/Ho_Chi_Minh).

## What the audit found

The starting checkout passed typecheck, build, and 393 tests. Sixteen live
PostgreSQL/Redis tests were skipped without disposable service URLs. Existing
HTTP tests covered the dispatcher, but no committed real-browser test suite
connected clicks, API requests, rendered output, and browser-local progress.

## Ideas selected and implemented

| Improvement | Evidence and resulting behavior |
| --- | --- |
| Repeatable browser coverage | Playwright exercises all 46 labs through the actual dashboard and compiled server, advanced presets/comparisons, learning progress, keyboard navigation, mobile layouts, and backups. Failure screenshots and traces support diagnosis. |
| Honest live database failures | Unexpected SQL failures used to look like ordinary teaching rollbacks. They now reach HTTP as errors; expected insufficient-funds/missing-account/simulated-crash outcomes remain normal results. Broken rollback connections are discarded. |
| Recoverable experiment requests | A stalled request could disable Run indefinitely. Cancel run and a 30-second deadline restore control, exclude late results and rewards, and explain that server work may still be finishing. Error details appear beside the results. |
| Lossless sprint backup merging | Compatible same-day sprint steps now merge. Newer sprints supersede older ones, current choices resolve incompatible targets, and existing daily rewards cannot be duplicated. |
| Clear reflection save state | Imports preserve unsaved drafts. The notebook shows saved/unsaved state and character count, offers discard-to-saved, and requests the browser's leave-page protection while a dirty reflection exists. Drafts remain session-only until saved. |
| Continuous regression checks | CI runs live PostgreSQL/Redis tests, browser E2E, and a mandatory high-severity dependency audit. The compatible body-parser update removes the discovered audit finding. |

Potential later improvements include cross-engine browser coverage, saved
scenario comparisons, and an explicit multi-tab progress-conflict policy.
They are separate product decisions; this pass prioritizes correctness and
recoverability while preserving the existing local progress model.

## How to repeat validation

```sh
npm ci
npx playwright install chromium
npm run check
npm run test:e2e
```

For installed Google Chrome, use `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`.
The browser suite uses a separate compiled server and fresh browser contexts;
it does not reuse a developer's server or learning history. See the README for
port overrides and report viewing.

Run the complete unit/integration gate with both `TEST_DATABASE_URL` and
`TEST_REDIS_URL` pointing to disposable local services. The live HTTP suite
uses its own temporary PostgreSQL schema; the older live database suite resets
the seeded accounts. Do not point either at valuable data.

```sh
TEST_DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:PORT/DATABASE \
TEST_REDIS_URL=redis://127.0.0.1:PORT npm run check
```

The live HTTP suite verifies readiness, persisted balances, rollback, Redis
lock release, a deliberately broken schema returning HTTP 500/503, and recovery
after repair. The simulator HTTP suite separately enumerates every dashboard
lab, request validation, concurrency limits, metrics, and WebSocket behavior.

## Verified results

- Typecheck and compiled build passed.
- All 423 unit/DOM/integration/live-service tests passed with both services configured.
- The final focused UI review passed 98 tests after the reflection-draft changes.
- Dependency audit: zero vulnerabilities after the body-parser update.
- All 74 browser E2E tests passed in 3.1 minutes using installed Google Chrome
  on desktop and mobile viewports (`PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`).
  Coverage includes all 46 labs, all 12 scenario presets, backup round trips,
  reward deduplication, note save/discard, network recovery, cancellation, and timeout.
- Workflow YAML, JavaScript syntax, and `git diff --check` passed.

The browser HTML report is generated at `playwright-report/index.html` and is
intentionally ignored by Git. The first browser run identified a mobile-test
navigation mistake (a hidden sidebar); the final suite uses the visible back-to-lab
control and passes without retries. Firefox/WebKit were not run. Disposable
PostgreSQL and Redis containers and the manual verification server were stopped.

The deliberate schema-outage and WebSocket-size tests log expected errors.
The memory-leak teaching experiment intentionally emits a listener warning.
Local verification does not constitute a hosted CI run or a deployment.
