import { minimatch } from 'minimatch';
import type { FixerConfig } from './types.js';

export function assertAllowedFiles(files: string[], config: FixerConfig): void {
  const violations: string[] = [];
  for (const file of files) {
    const allowed = config.allowedPaths.some((pattern) => minimatch(file, pattern, { dot: true }));
    const blocked = config.blockedPaths.some((pattern) => minimatch(file, pattern, { dot: true }));
    if (!allowed || blocked) violations.push(file);
  }

  if (violations.length > 0) {
    throw new Error(`AI patch modified blocked or non-allowed files: ${violations.join(', ')}`);
  }
}

export function containsSecretLikeContent(patch: string): boolean {
  const riskyPatterns = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /AKIA[0-9A-Z]{16}/,
    /ghp_[A-Za-z0-9_]{30,}/,
    /github_pat_[A-Za-z0-9_]{40,}/,
    /sk-[A-Za-z0-9]{32,}/
  ];
  return riskyPatterns.some((pattern) => pattern.test(patch));
}
