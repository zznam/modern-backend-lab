// Run independently of the local runner, with only Actions-read/Issues-write.
module.exports = async function notify({ github, context, core }) {
  const run = context.payload.workflow_run;
  const { owner, repo } = context.repo;
  if (run?.name !== 'Production deployment E2E' || run.head_branch !== 'main'
    || run.head_repository?.full_name !== `${owner}/${repo}`
    || !['repository_dispatch', 'workflow_dispatch'].includes(run.event)
    || !['failure', 'timed_out', 'startup_failure', 'action_required'].includes(run.conclusion)) return;

  const attempt = run.run_attempt || 1;
  const marker = `<!-- production-e2e-failure:${run.id}:${attempt} -->`;
  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner, repo, state: 'all', creator: 'github-actions[bot]', per_page: 100,
  });
  if (issues.some(issue => issue.body?.includes(marker))) {
    core.info('Notification already delivered for this run attempt.');
    return;
  }
  const runURL = `${context.serverUrl}/${owner}/${repo}/actions/runs/${run.id}`;
  let report = `No report was uploaded (the runner or setup may have failed). [View run logs](${runURL}).`;
  try {
    const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, {
      owner, repo, run_id: run.id, per_page: 100,
    });
    const artifact = artifacts.find(item => !item.expired
      && item.name.startsWith('production-e2e-') && item.name.endsWith(`-${attempt}`));
    if (artifact) {
      report = `[Download test report and screenshots](${runURL}/artifacts/${artifact.id}). `
        + 'Extract the archive and open `playwright-report-live/index.html`. Reports expire after 14 days.';
    }
  } catch {
    // Missing artifact access must not suppress the failure notification.
    report = `The test report could not be retrieved. [View run and available artifacts](${runURL}).`;
  }
  const issue = await github.rest.issues.create({
    owner, repo, assignees: ['zznam'],
    title: `Production E2E failed: run ${run.id}, attempt ${attempt}`,
    body: `${marker}\n@zznam Production deployment verification **${run.conclusion}**.\n\n`
      + `- [Failed workflow run](${runURL}/attempts/${attempt})\n`
      + `- Workflow commit: \`${run.head_sha}\` (the tested deployment identity is in the run summary).\n\n`
      + `${report}\n\nCheck the failure before treating this production deployment as verified.`,
  });
  core.info(`Failure notification: ${issue.data.html_url}`);
};
