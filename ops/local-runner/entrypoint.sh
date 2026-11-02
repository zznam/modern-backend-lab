#!/bin/bash
set -euo pipefail
cd /home/pwuser/actions-runner
unset ACTIONS_RUNNER_PRINT_LOG_TO_STDOUT

if [[ ! -f .runner ]]; then
  # The host manager sends a short-lived registration token through stdin.
  # Never keep it in Docker environment metadata, a host file, or host command args.
  registration_pipe=/tmp/modern-backend-runner-registration
  rm -f "$registration_pipe"
  mkfifo -m 600 "$registration_pipe"
  IFS= read -r registration_token < "$registration_pipe"
  rm -f "$registration_pipe"
  ./config.sh --unattended \
    --url "$RUNNER_REPO_URL" --token "$registration_token" \
    --name "$LOCAL_RUNNER_NAME" --labels modern-backend-production --work _work
  unset registration_token
fi

# Leave runner auto-updates enabled; GitHub rejects obsolete runner versions.
exec ./run.sh
