import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
const notify = createRequire(import.meta.url)('../scripts/notify-production-e2e.cjs');

function fixture() {
  const context = { repo: { owner: 'zznam', repo: 'modern-backend-lab' }, serverUrl: 'https://github.com',
    payload: { workflow_run: { id: 123, run_attempt: 2, name: 'Production deployment E2E',
      head_branch: 'main', head_repository: { full_name: 'zznam/modern-backend-lab' },
      head_sha: 'a'.repeat(40), event: 'repository_dispatch', conclusion: 'failure' } } };
  const create = vi.fn().mockResolvedValue({ data: { html_url: 'https://github.com/issue/1' } });
  const paginate = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([
    { id: 10, name: 'production-e2e-dpl_test-1', expired: false },
    { id: 11, name: 'production-e2e-dpl_test-2', expired: false },
  ]);
  return { context, github: { paginate, rest: { issues: { listForRepo: vi.fn(), create },
    actions: { listWorkflowRunArtifacts: vi.fn() } } }, core: { info: vi.fn() } };
}

describe('production failure notifications', () => {
  it('assigns the alert and links the matching attempt report', async () => {
    const input = fixture(); await notify(input);
    expect(input.github.rest.issues.create).toHaveBeenCalledWith(expect.objectContaining({
      assignees: ['zznam'], body: expect.stringContaining('/runs/123/artifacts/11'),
    }));
    expect(input.github.rest.issues.create.mock.calls[0][0].body).toContain('/attempts/2');
  });
  it.each(['success', 'cancelled', 'skipped'])('stays quiet for %s', async conclusion => {
    const input = fixture(); input.context.payload.workflow_run.conclusion = conclusion;
    await notify(input); expect(input.github.paginate).not.toHaveBeenCalled();
  });
  it('rejects fork runs', async () => {
    const input = fixture(); input.context.payload.workflow_run.head_repository.full_name = 'other/repo';
    await notify(input); expect(input.github.paginate).not.toHaveBeenCalled();
  });
  it('does not duplicate an existing notification, even when closed', async () => {
    const input = fixture(); input.github.paginate.mockReset().mockResolvedValueOnce([
      { body: '<!-- production-e2e-failure:123:2 -->', state: 'closed' },
    ]);
    await notify(input); expect(input.github.rest.issues.create).not.toHaveBeenCalled();
  });
  it.each(['missing', 'api-error'])('still alerts when report is %s', async mode => {
    const input = fixture(); input.github.paginate.mockReset().mockResolvedValueOnce([]);
    if (mode === 'missing') input.github.paginate.mockResolvedValueOnce([]);
    else input.github.paginate.mockRejectedValueOnce(new Error('API unavailable'));
    await notify(input);
    const body = input.github.rest.issues.create.mock.calls[0][0].body;
    expect(body).toContain('https://github.com/zznam/modern-backend-lab/actions/runs/123');
    expect(body).not.toContain('/artifacts/');
  });
});
