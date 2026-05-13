import { runShell } from './shell.js';

export async function gitStatus(repoRoot: string): Promise<string> {
  const result = await runShell('git status --short', repoRoot);
  return result.combined.trim();
}

export async function gitDiff(repoRoot: string): Promise<string> {
  const result = await runShell('git diff -- .', repoRoot);
  return result.combined.trim();
}

export async function currentBranch(repoRoot: string): Promise<string> {
  const result = await runShell('git rev-parse --abbrev-ref HEAD', repoRoot, true);
  return result.stdout.trim();
}

export async function createBranch(repoRoot: string, branch: string): Promise<void> {
  await runShell(`git checkout -B ${quote(branch)}`, repoRoot, true);
}

export async function applyPatch(repoRoot: string, patch: string): Promise<void> {
  if (!patch.trim()) throw new Error('AI returned an empty patch');
  const escaped = patch.replace(/'$/gm, `'\\''`);
  await runShell(`cat > /tmp/ai-ci-fix.patch <<'PATCH'\n${escaped}\nPATCH\ngit apply --index /tmp/ai-ci-fix.patch`, repoRoot, true);
}

export async function changedFiles(repoRoot: string): Promise<string[]> {
  const result = await runShell('git diff --cached --name-only', repoRoot, true);
  return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

export async function commitAndPush(repoRoot: string, branch: string, message: string): Promise<void> {
  await runShell('git config user.name "ai-ci-auto-fixer[bot]"', repoRoot, true);
  await runShell('git config user.email "ai-ci-auto-fixer[bot]@users.noreply.github.com"', repoRoot, true);
  await runShell(`git commit -m ${quote(message)}`, repoRoot, true);
  await runShell(`git push origin ${quote(branch)} --force-with-lease`, repoRoot, true);
}

export async function resetHard(repoRoot: string): Promise<void> {
  await runShell('git reset --hard HEAD && git clean -fd', repoRoot, true);
}

function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
