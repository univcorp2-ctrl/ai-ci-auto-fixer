import fs from 'node:fs';
import path from 'node:path';
import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';
import { Octokit } from '@octokit/rest';
import yaml from 'js-yaml';
import { minimatch } from 'minimatch';

const exec = promisify(execCb);

export const DEFAULT_CONFIG = {
  maxAttempts: 3,
  testCommand: 'npm test',
  buildCommand: '',
  dryRun: false,
  maxLogChars: 60000,
  allowedPaths: ['src/**', 'test/**', 'tests/**', '__tests__/**', 'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'tsconfig*.json', 'vite.config.*', 'vitest.config.*'],
  blockedPaths: ['.github/**', '.env', '.env.*', '**/*.pem', '**/*.key', '**/*.p12', '**/*.crt', '**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.webp', '**/*.zip', '**/*.tar', '**/*.gz']
};

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else { args[key] = next; i++; }
  }
  return args;
}

function required(args, key, fallback) {
  const value = args[key] || fallback;
  if (!value || value === true) throw new Error(`Missing required argument --${key}`);
  return String(value);
}

function octokit() {
  const token = process.env.AI_FIXER_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error('AI_FIXER_GITHUB_TOKEN or GITHUB_TOKEN is required');
  return new Octokit({ auth: token });
}

export function loadConfig(root = process.cwd()) {
  const file = path.join(root, '.ai-fixer.yml');
  if (!fs.existsSync(file)) return { ...DEFAULT_CONFIG };
  return { ...DEFAULT_CONFIG, ...(yaml.load(fs.readFileSync(file, 'utf8')) || {}) };
}

export function trimLog(log, maxChars) {
  if (log.length <= maxChars) return log;
  return `${log.slice(0, Math.floor(maxChars * 0.2))}\n\n--- LOG TRUNCATED ---\n\n${log.slice(-Math.floor(maxChars * 0.8))}`;
}

export function extractFileHints(text) {
  const found = new Set();
  const re = /(?:^|\s|FAIL|Error|at|❯)\s*([A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|yml|yaml|py|go|rs|java|kt|rb|php))(?::\d+)?/gm;
  let match;
  while ((match = re.exec(text)) !== null) {
    const file = match[1].replace(/^\.\//, '');
    if (!file.includes('node_modules')) found.add(file);
  }
  return [...found].slice(0, 40);
}

export function isAllowedFile(file, config) {
  const f = file.replace(/\\/g, '/');
  const allowed = config.allowedPaths.some((p) => minimatch(f, p, { dot: true }));
  const blocked = config.blockedPaths.some((p) => minimatch(f, p, { dot: true }));
  return allowed && !blocked;
}

export function assertAllowedFiles(files, config) {
  const bad = files.filter((file) => !isAllowedFile(file, config));
  if (bad.length) throw new Error(`AI patch modified blocked or non-allowed files: ${bad.join(', ')}`);
}

export function containsSecretLikeContent(text) {
  return [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, /AKIA[0-9A-Z]{16}/, /ghp_[A-Za-z0-9_]{30,}/, /github_pat_[A-Za-z0-9_]{40,}/, /sk-[A-Za-z0-9]{32,}/].some((r) => r.test(text));
}

export function parseAiJson(text) {
  const cleaned = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  throw new Error(`AI response was not valid JSON: ${cleaned.slice(0, 1000)}`);
}

function addSnapshotFile(root, rel, config, out) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return;
  const st = fs.statSync(abs);
  if (st.isDirectory()) {
    for (const child of fs.readdirSync(abs)) addSnapshotFile(root, path.join(rel, child), config, out);
  } else if (st.isFile() && isAllowedFile(rel, config)) {
    out.add(rel.replace(/\\/g, '/'));
  }
}

export function buildRepoSnapshot(root, config, hints) {
  const files = new Set();
  for (const h of hints) addSnapshotFile(root, h, config, files);
  for (const h of ['package.json', 'src', 'test', 'tests']) addSnapshotFile(root, h, config, files);
  let total = 0;
  const parts = [];
  for (const file of [...files].sort()) {
    const body = fs.readFileSync(path.join(root, file), 'utf8');
    const clipped = body.length > 12000 ? `${body.slice(0, 12000)}\n/* FILE TRUNCATED */` : body;
    if (total + clipped.length > 70000) break;
    total += clipped.length;
    parts.push(`--- FILE: ${file} ---\n${clipped}`);
  }
  return parts.join('\n\n');
}

async function sh(command, cwd = process.cwd(), reject = false) {
  try {
    const r = await exec(command, { cwd, env: { ...process.env, CI: 'true' }, maxBuffer: 20 * 1024 * 1024 });
    return { exitCode: 0, stdout: r.stdout || '', stderr: r.stderr || '', combined: `${r.stdout || ''}\n${r.stderr || ''}` };
  } catch (e) {
    const result = { exitCode: e.code || 1, stdout: e.stdout || '', stderr: e.stderr || '', combined: `${e.stdout || ''}\n${e.stderr || ''}` };
    if (reject) throw new Error(result.combined || e.message);
    return result;
  }
}

async function downloadLogs(owner, repo, runId, maxChars) {
  const api = octokit();
  const res = await api.actions.downloadWorkflowRunLogs({ owner, repo, run_id: Number(runId) });
  const text = typeof res.data === 'string' ? res.data : Buffer.from(res.data).toString('utf8');
  return trimLog(text, maxChars);
}

function buildPrompt({ owner, repo, runId, baseRef, logs, snapshot, config, attempt, previousFailure }) {
  return `You are an autonomous CI repair agent. Return only JSON with keys summary and patch. patch must be a valid unified git diff starting with diff --git. Make the smallest safe change. Do not add secrets. Prefer fixing code over weakening tests unless the test is clearly wrong.\n\nRepository: ${owner}/${repo}\nRun ID: ${runId}\nAttempt: ${attempt}\nBase ref: ${baseRef}\n\nAllowed paths:\n${config.allowedPaths.map((p) => `- ${p}`).join('\n')}\n\nBlocked paths:\n${config.blockedPaths.map((p) => `- ${p}`).join('\n')}\n\nPrevious failure:\n${previousFailure || '(none)'}\n\nCI logs:\n${logs}\n\nRelevant files:\n${snapshot}`;
}

async function generateFix(request) {
  const provider = process.env.AI_PROVIDER || 'command';
  const prompt = buildPrompt(request);
  if (provider === 'command') {
    const command = process.env.AI_FIX_COMMAND;
    if (!command) throw new Error('AI_PROVIDER=command requires AI_FIX_COMMAND');
    const r = await exec(command, { input: JSON.stringify({ prompt, request }, null, 2), shell: '/bin/bash', maxBuffer: 20 * 1024 * 1024 });
    return parseAiJson(r.stdout);
  }
  if (provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required');
    const r = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: process.env.AI_MODEL || 'gpt-5.1', input: prompt, text: { format: { type: 'json_object' } } }) });
    const body = await r.text();
    if (!r.ok) throw new Error(`OpenAI API error ${r.status}: ${body}`);
    const json = JSON.parse(body);
    return parseAiJson(json.output_text || JSON.stringify(json));
  }
  if (provider === 'anthropic') {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is required');
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: process.env.AI_MODEL || 'claude-sonnet-4-5', max_tokens: 8000, messages: [{ role: 'user', content: prompt }] }) });
    const body = await r.text();
    if (!r.ok) throw new Error(`Anthropic API error ${r.status}: ${body}`);
    const json = JSON.parse(body);
    return parseAiJson((json.content || []).map((x) => x.text || '').join('\n'));
  }
  throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
}

async function applyPatch(root, patch) {
  if (!patch || !patch.trim()) throw new Error('AI returned an empty patch');
  fs.writeFileSync('/tmp/ai-ci-fix.patch', patch);
  await sh('git apply --index /tmp/ai-ci-fix.patch', root, true);
}

async function fixFailedCi(args) {
  const owner = required(args, 'owner', process.env.GITHUB_REPOSITORY_OWNER);
  const repo = required(args, 'repo', process.env.GITHUB_REPOSITORY?.split('/')[1]);
  const runId = required(args, 'run-id', process.env.GITHUB_RUN_ID);
  const baseRef = required(args, 'base-ref', process.env.GITHUB_REF_NAME || 'main');
  const root = process.cwd();
  const config = loadConfig(root);
  const branch = `ai-fix/ci-${runId}`;
  const logs = await downloadLogs(owner, repo, runId, config.maxLogChars);
  const hints = extractFileHints(logs);
  let previousFailure = '';

  await sh(`git checkout -B ${branch}`, root, true);

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    await sh('git reset --hard HEAD && git clean -fd', root, true);
    await sh(`git checkout -B ${branch}`, root, true);
    const snapshot = buildRepoSnapshot(root, config, hints);
    const fix = await generateFix({ owner, repo, runId, baseRef, logs, snapshot, config, attempt, previousFailure });
    if (containsSecretLikeContent(fix.patch)) throw new Error('AI patch appears to contain a secret-like value; refusing to apply.');
    await applyPatch(root, fix.patch);
    const changed = (await sh('git diff --cached --name-only', root, true)).stdout.split('\n').filter(Boolean);
    assertAllowedFiles(changed, config);
    const test = await sh(config.testCommand, root);
    if (test.exitCode !== 0) { previousFailure = test.combined.slice(-20000); continue; }
    if (config.buildCommand) {
      const build = await sh(config.buildCommand, root);
      if (build.exitCode !== 0) { previousFailure = build.combined.slice(-20000); continue; }
    }
    if (config.dryRun) { console.log(`DRY RUN passed. Changed files: ${changed.join(', ')}`); return; }
    await sh('git config user.name "ai-ci-auto-fixer[bot]" && git config user.email "ai-ci-auto-fixer[bot]@users.noreply.github.com"', root, true);
    await sh(`git commit -m "fix(ci): repair failed run ${runId}"`, root, true);
    await sh(`git push origin ${branch} --force-with-lease`, root, true);
    const pr = await octokit().pulls.create({ owner, repo, head: branch, base: baseRef, title: `fix(ci): repair failed workflow run ${runId}`, body: `AI CI Auto Fixer generated this PR after tests passed.\n\nFailed run: ${runId}\nChanged files:\n${changed.map((f) => `- ${f}`).join('\n')}` });
    console.log(`Created PR: ${pr.data.html_url}`);
    return;
  }
  throw new Error(`Could not produce a passing fix after ${config.maxAttempts} attempts. Last failure:\n${previousFailure}`);
}

async function listRepos(owner, isOrg, includePrivate) {
  const api = octokit();
  const repos = [];
  if (isOrg) {
    for await (const page of api.paginate.iterator(api.repos.listForOrg, { org: owner, type: includePrivate ? 'all' : 'public', per_page: 100 })) repos.push(...page.data);
  } else {
    for await (const page of api.paginate.iterator(api.repos.listForUser, { username: owner, type: includePrivate ? 'all' : 'public', per_page: 100 })) repos.push(...page.data);
  }
  return repos.filter((r) => !r.archived && (includePrivate || !r.private));
}

async function upsertFile(owner, repo, filePath, content, branch) {
  const api = octokit();
  let sha;
  try {
    const old = await api.repos.getContent({ owner, repo, path: filePath, ref: branch });
    if (!Array.isArray(old.data)) sha = old.data.sha;
  } catch (e) { if (e.status !== 404) throw e; }
  await api.repos.createOrUpdateFileContents({ owner, repo, path: filePath, branch, sha, message: 'chore: install AI CI fixer workflow', content: Buffer.from(content).toString('base64') });
}

async function installWorkflow(args) {
  const owner = required(args, 'owner');
  const isOrg = Boolean(args.org);
  const includePrivate = Boolean(args['include-private']);
  const aiFixerRepo = required(args, 'ai-fixer-repo', process.env.AI_FIXER_REPO);
  const aiFixerRef = String(args['ai-fixer-ref'] || process.env.AI_FIXER_REF || 'main');
  const template = fs.readFileSync(path.resolve('templates/ai-ci-fixer.yml'), 'utf8').replaceAll('__AI_FIXER_REPO__', aiFixerRepo).replaceAll('__AI_FIXER_REF__', aiFixerRef);
  const repos = await listRepos(owner, isOrg, includePrivate);
  const installed = [];
  const skipped = [];
  for (const r of repos) {
    try {
      const [repoOwner, repoName] = r.full_name.split('/');
      await upsertFile(repoOwner, repoName, '.github/workflows/ai-ci-fixer.yml', template, r.default_branch || 'main');
      installed.push(r.full_name);
    } catch (e) { skipped.push(`${r.full_name}: ${e.message}`); }
  }
  console.log(`Installed workflow in ${installed.length} repositories.`);
  installed.forEach((x) => console.log(`- ${x}`));
  if (skipped.length) { console.log(`Skipped ${skipped.length} repositories.`); skipped.forEach((x) => console.log(`- ${x}`)); }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (cmd === 'fix-failed-ci') return fixFailedCi(args);
  if (cmd === 'install-workflow') return installWorkflow(args);
  console.error('Usage: npm run fix -- --owner OWNER --repo REPO --run-id RUN_ID --base-ref main');
  console.error('   or: npm run install-workflow -- --owner OWNER [--org] [--include-private] --ai-fixer-repo OWNER/ai-ci-auto-fixer');
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.stack || e.message); process.exitCode = 1; });
}
