# DailyTTRPG pull request CI

The **DailyTTRPG CI** workflow runs for pull requests targeting `main`, including updates to open PRs. It checks the PR's proposed merge with `main`. Both Codex and Claude Code can use ordinary PRs. Checks run even for documentation-only changes so branch protection can require the same job names on every PR. A new run cancels an older run for the same PR.

| Check | What it validates | Where to look on failure |
| --- | --- | --- |
| **DailyTTRPG / Backend build and syntax** | Parses JavaScript in `backend/src` and `backend/test` with the Node 20 runtime used by the backend image. Builds the existing Dockerfile locally on the runner. | The syntax step reports the file and line. If syntax passes, inspect Docker's first failing build instruction or npm error. |
| **DailyTTRPG / Backend tests and regressions** | Initializes a fresh PostgreSQL 16 database with all `db/init` SQL, validates the Greyvale content pack, then runs the full `npm test` suite serially. This includes HTTP and persistence integration tests, SMS simulator tests, the Greyvale full loop and vertical slice, canonical Rusk and Rusk end-to-end acceptance, and the Stage 6D final gate. | Database startup failures include the container log. Content validation identifies the failing asset. For test failures, find the first failing TAP subtest and its assertion or stack trace. |
| **DailyTTRPG / Flutter and hosting checks** | Resolves dependencies from the committed lockfile on Flutter 3.44.0, runs `flutter analyze`, and runs all existing Dart unit and widget tests, including the Greyvale exploration regression and Rusk acceptance contract. Compiles the release web app at `/play/` and runs the existing static Firebase Hosting page validator on the assembled local output. | Look at the specific failed step. A lockfile failure can indicate an SDK mismatch or a dependency change. Analysis reports source locations and widget failures name their test. A hosting failure after compilation usually points to a route, link, or page assertion. |

## Isolation and deployment

Backend execution uses Docker containers that share a loopback-only network namespace. PostgreSQL has no published ports and the tests receive a fixed, disposable database URL, simulated SMS and test Firebase authentication. The database and its volume are removed after the run. To reproduce from a clean checkout with Docker, run `bash DailyTTRPG/scripts/ci-backend-test.sh` from the repository root. The script refuses to load local application `.env` files.

The workflow uses GitHub-hosted runners and grants the GitHub token only `contents: read`. Checkout does not persist credentials. The workflow has no production environment, service credentials, deploy steps, or `push` or `pull_request_target` triggers. Flutter tests run as the runner user in a separate loopback-only network namespace and use test data and fakes. The tests and web build supply a dummy Firebase project, leave the Firebase API key and app ID unset, and point to a loopback backend. The assembled hosting files stay on the ephemeral runner.

If the repository later enables branch protection for this workflow, select the three job names above as required checks after GitHub has recorded them. The existing merge and production deployment process stays in place.

## Coverage gaps

- The Node backend has no configured style linter or transpilation step. The backend check covers syntax and Docker image assembly.
- The Flutter checks cover Dart and the web target. The repository has no native player build targets or automated real-browser end-to-end suite that exercises the Flutter UI against a running backend.
- Firebase OAuth, SMS delivery, production database upgrades and live hosting remain outside PR CI. The test database starts empty and uses the checked-in bootstrap SQL. Existing test skips, if any, appear in the test runner's summary.
