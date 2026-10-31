#!/usr/bin/env python3
"""Manage only modern-backend-lab's isolated Docker GitHub Actions runner."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import time


ROOT = Path(__file__).resolve().parents[2]
REPO = "zznam/modern-backend-lab"
NAME = "zznam-modern-backend-production"
IMAGE = "zznam-modern-backend-production-runner:playwright-1.64.1"
LABEL = "io.zznam.runner.repository"


def capture(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


def api(endpoint="", *args):
    endpoint = f"repos/{REPO}" + (f"/{endpoint}" if endpoint else "")
    return json.loads(capture("gh", "api", endpoint, *args))


def container():
    result = subprocess.run(["docker", "container", "inspect", NAME],
                            text=True, capture_output=True, check=False)
    if result.returncode:
        return None
    info = json.loads(result.stdout)[0]
    if info["Config"].get("Labels", {}).get(LABEL) != REPO:
        raise RuntimeError(f"Container {NAME} belongs to a different configuration")
    return info


def build():
    subprocess.run(["docker", "build", "--platform", "linux/arm64", "--tag", IMAGE,
                    str(ROOT / "ops/local-runner")], cwd=ROOT, check=True)


def start():
    if not api()["permissions"]["admin"]:
        raise RuntimeError(f"Repository admin access is required to register a runner for {REPO}")
    info = container()
    if info:
        if not info["State"]["Running"]:
            subprocess.run(["docker", "start", NAME], check=True)
        wait_online()
        return
    image = subprocess.run(["docker", "image", "inspect", IMAGE],
                           text=True, capture_output=True, check=False)
    if image.returncode:
        build()
        image = subprocess.run(["docker", "image", "inspect", IMAGE],
                               text=True, capture_output=True, check=True)
    if json.loads(image.stdout)[0]["Architecture"] != "arm64":
        raise RuntimeError("The local runner image must use native ARM64")
    if any(runner["name"] == NAME for runner in api("actions/runners")["runners"]):
        raise RuntimeError("Runner is registered without its container; remove it before registering again")

    # Keep the short-lived token in this process, then pass it only via stdin.
    token = api("actions/runners/registration-token", "--method", "POST")["token"]
    command = ["docker", "run", "--detach", "--init", "--name", NAME,
               "--label", f"{LABEL}={REPO}", "--platform", "linux/arm64",
               "--restart", "unless-stopped", "--cpus", "2", "--memory", "4g",
               "--shm-size", "1g", "--cap-drop", "ALL",
               "--security-opt", "no-new-privileges:true",
               "--env", f"RUNNER_REPO_URL=https://github.com/{REPO}",
               "--env", f"LOCAL_RUNNER_NAME={NAME}", IMAGE]
    result = subprocess.run(command, text=True, capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    print(f"Started {NAME}: {result.stdout.strip()[:12]}", flush=True)
    # Waiting for a FIFO prevents an absent pipe from becoming a token file.
    registration = subprocess.run(
        ["docker", "exec", "--interactive", NAME, "/bin/bash", "-c",
         "for attempt in {1..100}; do "
         "if [[ -p /tmp/modern-backend-runner-registration ]]; then "
         "cat > /tmp/modern-backend-runner-registration; exit; fi; sleep 0.1; done; exit 1"],
        input=token + "\n", text=True, capture_output=True, timeout=30)
    del token
    if registration.returncode:
        raise RuntimeError("Registration input failed; inspect this runner's logs")
    wait_online()


def wait_online():
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        info = container()
        if info and info["State"]["Running"]:
            for runner in api("actions/runners")["runners"]:
                if runner["name"] == NAME and runner["status"] == "online":
                    print(f"GitHub runner online: {NAME}")
                    return
        time.sleep(2)
    raise RuntimeError("Runner has not connected to GitHub; inspect this runner's logs")


def status():
    info = container()
    print(f"Container: {info['State']['Status'] if info else 'not created'}")
    for runner in api("actions/runners")["runners"]:
        if runner["name"] == NAME:
            print(f"GitHub: {runner['status']}; busy={runner['busy']}; labels="
                  + ",".join(label["name"] for label in runner["labels"]))
            return
    print("GitHub: not registered")


def stop():
    if any(runner["name"] == NAME and runner["busy"] for runner in api("actions/runners")["runners"]):
        raise RuntimeError("Runner is executing a job; wait for completion before stopping it")
    if container():
        subprocess.run(["docker", "stop", NAME], check=True)


def remove():
    runners = [runner for runner in api("actions/runners")["runners"] if runner["name"] == NAME]
    if any(runner["busy"] for runner in runners):
        raise RuntimeError("Runner is executing a job; wait for completion before removing it")
    info = container()
    if info:
        if info["State"]["Running"]:
            subprocess.run(["docker", "stop", NAME], check=True)
        subprocess.run(["docker", "rm", NAME], check=True)
    for runner in runners:
        subprocess.run(["gh", "api", f"repos/{REPO}/actions/runners/{runner['id']}",
                        "--method", "DELETE"], cwd=ROOT, check=True)
    print("Removed this repository's runner and container")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["build", "start", "status", "logs", "stop", "remove"])
    args = parser.parse_args()
    if args.action == "logs":
        if not container():
            raise RuntimeError("Runner container has not been created")
        subprocess.run(["docker", "logs", "--tail", "60", NAME], check=True)
    else:
        globals()[args.action]()


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
