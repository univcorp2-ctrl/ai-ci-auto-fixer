import { Octokit } from '@octokit/rest';

export function getOctokit(): Octokit {
  const token = process.env.AI_FIXER_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('AI_FIXER_GITHUB_TOKEN or GITHUB_TOKEN is required');
  }
  return new Octokit({ auth: token });
}

export async function downloadRunLogs(params: { owner: string; repo: string; runId: string; maxChars: number }): Promise<string> {
  const octokit = getOctokit();
  const response = await octokit.actions.downloadWorkflowRunLogs({
    owner: params.owner,
    repo: params.repo,
    run_id: Number(params.runId)
  });

  const data = response.data;
  let text: string;
  if (typeof data === 'string') {
    text = data;
  } else if (data instanceof ArrayBuffer) {
    text = Buffer.from(data).toString('utf8');
  } else if (Buffer.isBuffer(data)) {
    text = data.toString('utf8');
  } else {
    text = JSON.stringify(data);
  }

  return trimLog(text, params.maxChars);
}

export async function createPullRequest(params: {
  owner: string;
  repo: string;
  branch: string;
  baseRef: string;
  title: string;
  body: string;
}): Promise<string> {
  const octokit = getOctokit();
  const response = await octokit.pulls.create({
    owner: params.owner,
    repo: params.repo,
    head: params.branch,
    base: params.baseRef,
    title: params.title,
    body: params.body
  });
  return response.data.html_url;
}

export async function listRepositories(params: { owner: string; isOrg: boolean; includePrivate: boolean }): Promise<Array<{ name: string; full_name: string; private: boolean; archived: boolean; default_branch: string }>> {
  const octokit = getOctokit();
  const repos: Array<{ name: string; full_name: string; private: boolean; archived: boolean; default_branch: string }> = [];

  if (params.isOrg) {
    for await (const page of octokit.paginate.iterator(octokit.repos.listForOrg, {
      org: params.owner,
      type: params.includePrivate ? 'all' : 'public',
      per_page: 100
    })) {
      repos.push(...page.data.map(normalizeRepo));
    }
  } else {
    for await (const page of octokit.paginate.iterator(octokit.repos.listForUser, {
      username: params.owner,
      type: params.includePrivate ? 'all' : 'public',
      per_page: 100
    })) {
      repos.push(...page.data.map(normalizeRepo));
    }
  }

  return repos.filter((repo) => !repo.archived && (params.includePrivate || !repo.private));
}

export async function upsertFile(params: {
  owner: string;
  repo: string;
  path: string;
  content: string;
  branch: string;
  message: string;
}): Promise<void> {
  const octokit = getOctokit();
  let sha: string | undefined;
  try {
    const existing = await octokit.repos.getContent({
      owner: params.owner,
      repo: params.repo,
      path: params.path,
      ref: params.branch
    });
    if (!Array.isArray(existing.data) && 'sha' in existing.data) sha = existing.data.sha;
  } catch (error: unknown) {
    if (!(typeof error === 'object' && error !== null && 'status' in error && error.status === 404)) throw error;
  }

  await octokit.repos.createOrUpdateFileContents({
    owner: params.owner,
    repo: params.repo,
    path: params.path,
    message: params.message,
    content: Buffer.from(params.content, 'utf8').toString('base64'),
    branch: params.branch,
    sha
  });
}

function normalizeRepo(repo: { name: string; full_name?: string | null; private?: boolean; archived?: boolean; default_branch?: string | null }) {
  return {
    name: repo.name,
    full_name: repo.full_name ?? repo.name,
    private: Boolean(repo.private),
    archived: Boolean(repo.archived),
    default_branch: repo.default_branch ?? 'main'
  };
}

function trimLog(log: string, maxChars: number): string {
  if (log.length <= maxChars) return log;
  const head = log.slice(0, Math.floor(maxChars * 0.2));
  const tail = log.slice(-Math.floor(maxChars * 0.8));
  return `${head}\n\n--- LOG TRUNCATED ---\n\n${tail}`;
}
