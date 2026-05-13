#!/usr/bin/env node
import pc from 'picocolors';
import { fixFailedCi } from './fixer.js';
import { installWorkflow } from './installer.js';

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function getString(args: Record<string, string | boolean>, key: string, fallback?: string): string {
  const value = args[key];
  if (typeof value === 'string' && value.length > 0) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required argument --${key}`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (command === 'fix-failed-ci') {
    const result = await fixFailedCi({
      owner: getString(args, 'owner', process.env.GITHUB_REPOSITORY_OWNER),
      repo: getString(args, 'repo', process.env.GITHUB_REPOSITORY?.split('/')[1]),
      runId: getString(args, 'run-id', process.env.GITHUB_RUN_ID),
      baseRef: getString(args, 'base-ref', process.env.GITHUB_REF_NAME ?? 'main'),
      repoRoot: process.cwd()
    });
    console.log(pc.green(`Created PR: ${result.url}`));
    return;
  }

  if (command === 'install-workflow') {
    const result = await installWorkflow({
      owner: getString(args, 'owner'),
      isOrg: Boolean(args.org),
      includePrivate: Boolean(args['include-private']),
      aiFixerRepo: getString(args, 'ai-fixer-repo', process.env.AI_FIXER_REPO),
      aiFixerRef: getString(args, 'ai-fixer-ref', process.env.AI_FIXER_REF ?? 'main')
    });
    console.log(pc.green(`Installed workflow in ${result.installed.length} repositories.`));
    for (const item of result.installed) console.log(`- ${item}`);
    if (result.skipped.length > 0) {
      console.log(pc.yellow(`Skipped ${result.skipped.length} repositories.`));
      for (const item of result.skipped) console.log(`- ${item}`);
    }
    return;
  }

  console.error(`Usage:
  ai-ci-fixer fix-failed-ci --owner OWNER --repo REPO --run-id RUN_ID --base-ref main
  ai-ci-fixer install-workflow --owner OWNER [--org] [--include-private] --ai-fixer-repo OWNER/ai-ci-auto-fixer`);
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(pc.red(message));
  process.exitCode = 1;
});
