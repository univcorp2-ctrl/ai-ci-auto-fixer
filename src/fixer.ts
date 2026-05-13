import pc from 'picocolors';
import { loadConfig } from './config.js';
import { createPullRequest, downloadRunLogs } from './github.js';
import { applyPatch, changedFiles, commitAndPush, createBranch, gitStatus, resetHard } from './git.js';
import { buildRepoSnapshot, extractFileHints } from './repoSnapshot.js';
import { runShell } from './shell.js';
import { assertAllowedFiles, containsSecretLikeContent } from './security.js';
import { getProvider } from './providers/index.js';
import type { PullRequestResult } from './types.js';

export interface FixFailedCiOptions {
  owner: string;
  repo: string;
  runId: string;
  baseRef: string;
  repoRoot: string;
}

export async function fixFailedCi(options: FixFailedCiOptions): Promise<PullRequestResult> {
  const config = loadConfig(options.repoRoot);
  const provider = getProvider();
  const branch = `ai-fix/ci-${options.runId}`;

  console.log(pc.cyan(`Loading failed logs for ${options.owner}/${options.repo}#${options.runId}`));
  const logs = await downloadRunLogs({
    owner: options.owner,
    repo: options.repo,
    runId: options.runId,
    maxChars: config.maxLogChars
  });
  const hints = extractFileHints(logs);

  await createBranch(options.repoRoot, branch);

  let previousFailure: string | undefined;
  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    console.log(pc.cyan(`AI fix attempt ${attempt}/${config.maxAttempts}`));
    await resetHard(options.repoRoot);
    await createBranch(options.repoRoot, branch);

    const repoSnapshot = buildRepoSnapshot(options.repoRoot, config, hints);
    const response = await provider.generateFix({
      context: {
        owner: options.owner,
        repo: options.repo,
        runId: options.runId,
        baseRef: options.baseRef,
        repoRoot: options.repoRoot,
        logs,
        changedFilesHint: hints,
        attempt,
        previousFailure
      },
      config,
      repoSnapshot,
      gitStatus: await gitStatus(options.repoRoot)
    });

    if (containsSecretLikeContent(response.patch)) {
      throw new Error('AI patch appears to contain a secret-like value; refusing to apply it.');
    }

    await applyPatch(options.repoRoot, response.patch);
    const files = await changedFiles(options.repoRoot);
    assertAllowedFiles(files, config);

    const test = await runShell(config.testCommand, options.repoRoot);
    if (test.exitCode !== 0) {
      previousFailure = test.combined.slice(-20000);
      console.log(pc.yellow(`Tests failed on attempt ${attempt}.`));
      continue;
    }

    if (config.buildCommand) {
      const build = await runShell(config.buildCommand, options.repoRoot);
      if (build.exitCode !== 0) {
        previousFailure = build.combined.slice(-20000);
        console.log(pc.yellow(`Build failed on attempt ${attempt}.`));
        continue;
      }
    }

    if (config.dryRun) {
      return { branch, url: 'dry-run:no-pr-created', files };
    }

    await commitAndPush(options.repoRoot, branch, `fix(ci): repair failed run ${options.runId}`);
    const url = await createPullRequest({
      owner: options.owner,
      repo: options.repo,
      branch,
      baseRef: options.baseRef,
      title: `fix(ci): repair failed workflow run ${options.runId}`,
      body: [
        'AI CI Auto Fixer generated this PR after reproducing and fixing a failed CI run.',
        '',
        `Failed run: ${options.runId}`,
        `Provider: ${process.env.AI_PROVIDER ?? 'command'}`,
        '',
        'Changed files:',
        ...files.map((file) => `- ${file}`)
      ].join('\n')
    });
    return { branch, url, files };
  }

  throw new Error(`Could not produce a passing fix after ${config.maxAttempts} attempts. Last failure:\n${previousFailure ?? '(unknown)'}`);
}
