const requiredWorkflows = [
  { file: 'ci.yml', name: 'El Molino Ops CI' },
  { file: 'mobile-ci.yml', name: 'El Molino Ops Mobile CI' },
  { file: 'cloudflare-staging-certification.yml', name: 'Cloudflare Staging Certification' },
];

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

async function github(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'el-molino-release-provenance',
    },
  });
  if (!response.ok) fail(`GitHub provenance API failed (${response.status}) for ${path}`);
  return response.json();
}

const repo = process.env.GITHUB_REPOSITORY;
const target = process.env.TARGET_SHA || process.env.GITHUB_SHA;
const ref = process.env.GITHUB_REF;
const token = process.env.GITHUB_TOKEN;

if (!repo || !/^[^/]+\/[^/]+$/.test(repo)) fail('GITHUB_REPOSITORY is missing or invalid');
if (!target || !/^[0-9a-f]{40}$/.test(target)) fail('TARGET_SHA is missing or invalid');
if (ref !== 'refs/heads/main') fail('Production release provenance requires refs/heads/main');
if (!token) fail('GITHUB_TOKEN is unavailable for release provenance verification');

const commit = await github(`/repos/${repo}/commits/${target}`, token);
if (commit.sha !== target) fail('GitHub commit lookup did not return the exact target SHA');
if (!commit.commit?.verification?.verified) fail('Target main commit is not signature-verified by GitHub');
if (commit.committer?.login !== 'web-flow') fail('Target main commit was not created by the GitHub merge service');
if (!Array.isArray(commit.parents) || commit.parents.length !== 2) fail('Target main commit is not an exact two-parent PR merge commit');

const certifiedHead = commit.parents[1]?.sha;
if (!certifiedHead || !/^[0-9a-f]{40}$/.test(certifiedHead)) fail('Merged PR head SHA is missing from the target merge commit');

const associated = await github(`/repos/${repo}/commits/${target}/pulls`, token);
const eligible = (Array.isArray(associated) ? associated : []).filter((pr) =>
  pr?.merged_at &&
  pr?.merge_commit_sha === target &&
  pr?.base?.ref === 'main' &&
  pr?.head?.sha === certifiedHead &&
  pr?.head?.repo?.full_name === repo
);
if (eligible.length !== 1) fail(`Expected exactly one merged same-repository PR for target SHA; found ${eligible.length}`);
const pr = eligible[0];

for (const requirement of requiredWorkflows) {
  const query = new URLSearchParams({
    head_sha: certifiedHead,
    event: 'pull_request',
    per_page: '100',
  });
  const data = await github(`/repos/${repo}/actions/workflows/${requirement.file}/runs?${query}`, token);
  const matching = (data.workflow_runs || [])
    .filter((run) =>
      run?.head_sha === certifiedHead &&
      run?.event === 'pull_request' &&
      run?.name === requirement.name &&
      Array.isArray(run.pull_requests) &&
      run.pull_requests.some((item) => item?.number === pr.number)
    )
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
  const latest = matching[0];
  if (!latest) fail(`${requirement.name} has no exact-head pull-request run for PR #${pr.number}`);
  if (latest.status !== 'completed' || latest.conclusion !== 'success') {
    fail(`${requirement.name} latest exact-head run is not successful (status=${latest.status || 'missing'}, conclusion=${latest.conclusion || 'missing'})`);
  }
  console.log(`${requirement.name}: PASS run ${latest.id}`);
}

console.log(`Release provenance: PASS PR #${pr.number} head ${certifiedHead} -> merge ${target}`);
