#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
image="${E2E_DOCKER_IMAGE:-modern-backend-lab-e2e:${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}}"
export E2E_BASE_URL="${E2E_BASE_URL:-https://modern-backend-lab.vercel.app}"

mkdir -p "$repo_dir/playwright-report-live" "$repo_dir/test-results-live"
docker build --file "$repo_dir/Dockerfile.e2e" --tag "$image" "$repo_dir"

# Only reports are mounted. The source, dependencies, and browsers come from the
# image; credentials are passed by environment name and never printed here.
docker run --rm --init --ipc=host \
  --env CI=1 \
  --env E2E_BASE_URL \
  --env VERCEL_AUTOMATION_BYPASS_SECRET \
  --env E2E_EXPECTED_DEPLOYMENT_ID \
  --env E2E_EXPECTED_COMMIT_SHA \
  --mount "type=bind,source=$repo_dir/playwright-report-live,target=/app/playwright-report-live" \
  --mount "type=bind,source=$repo_dir/test-results-live,target=/app/test-results-live" \
  "$image" npm run test:e2e -- "$@"
