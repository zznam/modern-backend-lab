import { afterEach, describe, expect, it, vi } from 'vitest';
import { productionTarget } from '../scripts/production-target.ts';
import { protectionHeaders, verifyRemoteTarget } from './e2e/remote-target.ts';

const url = 'https://modern-backend-83dqzbuor-zznams-projects.vercel.app';
const sha = '45ee445cd58a6f7433f28d065cdcbf01e0b71e9e';
const id = 'dpl_example';
const event = () => ({
  action: 'vercel.deployment.promoted',
  client_payload: {
    environment: 'production', project: { id: 'prj_pNttLosL1ocNsfDPbDAn0MPTQoQq' },
    state: { type: 'promoted' }, id, url, git: { sha },
  },
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('production deployment event contract', () => {
  it('selects the promoted deployment instead of the moving production alias', () => {
    expect(productionTarget(event(), 'repository_dispatch')).toEqual({ id, url, sha });
    expect(productionTarget({ inputs: { deployment_id: id, deployment_url: url, commit_sha: sha } },
      'workflow_dispatch')).toEqual({ id, url, sha });
  });
  it.each(['preview', 'staging', ''])('rejects %s environments', environment => {
    const input = event(); input.client_payload.environment = environment;
    expect(() => productionTarget(input, 'repository_dispatch')).toThrow(/production promotion/);
  });
  it('rejects another project, unfinished deployments, and unsupported events', () => {
    const input = event(); input.client_payload.project.id = 'prj_other';
    expect(() => productionTarget(input, 'repository_dispatch')).toThrow();
    const unfinished = event(); unfinished.client_payload.state.type = 'ready';
    expect(() => productionTarget(unfinished, 'repository_dispatch')).toThrow();
    expect(() => productionTarget(event(), 'pull_request')).toThrow();
  });
  it.each([
    'https://evil.example', 'https://modern-backend-lab.vercel.app',
    `${url}/path`, `${url}?secret=x`, `${url}#fragment`, `${url}:8443`,
    url.replace('https:', 'http:'), url.replace('https://', 'https://user:pass@'),
  ])('rejects an unsafe or mutable deployment URL: %s', unsafe => {
    const input = event(); input.client_payload.url = unsafe;
    expect(() => productionTarget(input, 'repository_dispatch')).toThrow();
  });
  it('rejects output injection and incomplete commit IDs', () => {
    const input = event(); input.client_payload.id = 'dpl_ok\nsha=other';
    expect(() => productionTarget(input, 'repository_dispatch')).toThrow();
    const short = event(); short.client_payload.git.sha = sha.slice(0, 7);
    expect(() => productionTarget(short, 'repository_dispatch')).toThrow();
  });
});

describe('remote deployment preflight', () => {
  const readiness = () => ({
    status: 'READY', deployment: { id, commitSha: sha },
    adapters: {
      postgres: { mode: 'IN_MEMORY_FALLBACK', status: 'FALLBACK_READY' },
      redis: { mode: 'IN_MEMORY_FALLBACK', status: 'FALLBACK_READY' },
    },
  });
  function mockReady(body = readiness()) {
    return vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
  }
  it('checks the exact deployment and keeps authentication off redirects', async () => {
    vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', 'test-only-credential');
    vi.stubEnv('E2E_EXPECTED_DEPLOYMENT_ID', id);
    vi.stubEnv('E2E_EXPECTED_COMMIT_SHA', sha);
    mockReady();
    await expect(verifyRemoteTarget(url)).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(new URL('/api/v1/ready', url), expect.objectContaining({
      redirect: 'error', headers: { 'x-vercel-protection-bypass': 'test-only-credential' },
    }));
  });
  it.each(['E2E_EXPECTED_DEPLOYMENT_ID', 'E2E_EXPECTED_COMMIT_SHA'])('refuses mismatched %s', key => {
    vi.stubEnv(key, 'wrong-release'); mockReady();
    return expect(verifyRemoteTarget(url)).rejects.toThrow(/does not match/);
  });
  it('refuses a live database before running experiments', async () => {
    const body = readiness(); body.adapters.postgres.mode = 'LIVE_DATABASE'; mockReady(body);
    await expect(verifyRemoteTarget(url)).rejects.toThrow(/ready simulator/);
  });
  it('does not leak credentials through errors or send them to another origin', async () => {
    vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', 'test-only-credential');
    expect(() => protectionHeaders('https://evil.example')).toThrow(/immutable/);
    expect(() => protectionHeaders('https://modern-backend-lab.vercel.app')).toThrow(/immutable/);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('headers: test-only-credential')));
    await expect(verifyRemoteTarget(url)).rejects.toThrow('Remote readiness request failed; check deployment access and availability.');
  });
  it('retains public alias support when no bypass credential is configured', () => {
    vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', '');
    expect(protectionHeaders('https://modern-backend-lab.vercel.app')).toEqual({});
  });
});
