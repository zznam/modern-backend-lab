import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const projectId = 'prj_pNttLosL1ocNsfDPbDAn0MPTQoQq';
const repository = 'zznam/modern-backend-lab';

interface DeploymentEvent {
  action?: string;
  client_payload?: {
    environment?: string;
    project?: { id?: string };
    state?: { type?: string };
    id?: string;
    url?: string;
    git?: { sha?: string };
  };
  inputs?: { deployment_id?: string; deployment_url?: string; commit_sha?: string };
}

export function productionTarget(event: DeploymentEvent, eventName: string) {
  let id, url, sha;
  if (eventName === 'repository_dispatch') {
    const payload = event.client_payload;
    if (event.action !== 'vercel.deployment.promoted' || payload?.environment !== 'production'
      || payload.project?.id !== projectId || payload.state?.type !== 'promoted') {
      throw new Error('Expected a production promotion from the configured Vercel project.');
    }
    id = payload.id;
    url = payload.url;
    sha = payload.git?.sha;
  } else if (eventName === 'workflow_dispatch') {
    id = event.inputs?.deployment_id;
    url = event.inputs?.deployment_url;
    sha = event.inputs?.commit_sha;
  } else {
    throw new Error('Production verification only accepts deployment or manual dispatch events.');
  }
  if (!id || !/^dpl_[a-zA-Z0-9]+$/.test(id) || !sha || !/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error('A Vercel deployment ID and full commit SHA are required.');
  }
  const target = new URL(url || '');
  if (target.protocol !== 'https:' || target.port || target.origin !== url
    || !/^modern-backend(?:-lab)?-[a-z0-9]{9}-zznams-projects\.vercel\.app$/.test(target.hostname)) {
    throw new Error('Expected this project\'s immutable HTTPS deployment origin.');
  }
  return { id, url: target.origin, sha };
}

async function main() {
  if (process.env.GITHUB_REPOSITORY !== repository || process.env.GITHUB_REF !== 'refs/heads/main') {
    throw new Error('Production verification must run from this repository\'s main branch.');
  }
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, 'utf8'));
  const target = productionTarget(event, process.env.GITHUB_EVENT_NAME!);
  // Verify the deployed code belongs to reviewed main history before a local
  // runner or deployment credential is exposed to dependency/test code.
  const response = await fetch(`https://api.github.com/repos/${repository}/compare/${target.sha}...main`, {
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    redirect: 'error', signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Could not verify deployed commit ancestry (HTTP ${response.status}).`);
  const comparison = await response.json() as { status: string };
  if (!['ahead', 'identical'].includes(comparison.status)) {
    throw new Error('Deployed commit is not part of main history.');
  }
  for (const [key, value] of Object.entries(target)) appendFileSync(process.env.GITHUB_OUTPUT!, `${key}=${value}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
