# Local production E2E runner

This Apple Silicon Docker runner is dedicated to `zznam/modern-backend-lab`, with the `modern-backend-production` label. Playwright and its browsers run inside the container. It does not mount the Docker socket, a host checkout, credentials, or any other host directory. Repository registration and the job workspace stay in the container's writable layer.

Prerequisites: Docker Desktop running, Python 3, and `gh` authenticated as a repository administrator.

```bash
python3 ops/local-runner/manage.py build
python3 ops/local-runner/manage.py start
python3 ops/local-runner/manage.py status
python3 ops/local-runner/manage.py logs
```

`start` obtains a short-lived registration token and sends it through a private pipe inside the container. The token is not placed in host command arguments, Docker environment metadata, or a host file. Starting an existing stopped container reuses its registration. The container restarts with Docker Desktop unless it was explicitly stopped. The Mac and Docker must remain running for queued production checks to execute.

The container runs as `pwuser`, without additional Linux capabilities, with 2 CPUs, 4 GiB memory, and 1 GiB shared memory. Its runner auto-updates remain enabled. Update the pinned Playwright image to match `package-lock.json` when upgrading Playwright; rebuild the image, remove the idle runner, then start it again to use the new image.

```bash
python3 ops/local-runner/manage.py stop
python3 ops/local-runner/manage.py remove
```

`stop` and `remove` refuse to interrupt a busy runner. `remove` unregisters only this repository's named runner and deletes only its container; images and other repositories' runners are untouched.

Only trusted production deployment verification should target this label. Keep pull-request jobs on GitHub-hosted runners, and keep the `production-e2e` GitHub environment restricted to `main`. Store the Vercel automation bypass token only as a secret of that protected environment, and expose it only to the verification step. Runner labels select machines; they are not an authorization boundary for a public repository. Do not add host mounts or a Docker socket to this container.

Pinned upstream sources:

- [Playwright Docker images](https://playwright.dev/docs/docker)
- [GitHub Actions runner v2.338.2](https://github.com/actions/runner/releases/tag/v2.338.2)
