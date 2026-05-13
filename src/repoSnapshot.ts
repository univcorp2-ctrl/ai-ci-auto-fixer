import fs from 'node:fs';
import path from 'node:path';
import { minimatch } from 'minimatch';
import type { FixerConfig } from './types.js';

const MAX_FILE_CHARS = 12000;
const MAX_TOTAL_CHARS = 70000;

export function buildRepoSnapshot(repoRoot: string, config: FixerConfig, hints: string[]): string {
  const candidates = new Set<string>();
  for (const hint of hints) {
    const normalized = hint.replace(/^\.\//, '');
    if (isReadableCandidate(normalized, config)) candidates.add(normalized);
  }

  for (const fallback of ['package.json', 'tsconfig.json', 'vitest.config.ts', 'src', 'test', 'tests']) {
    addCandidates(repoRoot, fallback, config, candidates);
  }

  let total = 0;
  const parts: string[] = [];
  for (const file of [...candidates].sort()) {
    const absolute = path.join(repoRoot, file);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
    const content = fs.readFileSync(absolute, 'utf8');
    const clipped = content.length > MAX_FILE_CHARS ? `${content.slice(0, MAX_FILE_CHARS)}\n/* FILE TRUNCATED */` : content;
    if (total + clipped.length > MAX_TOTAL_CHARS) break;
    total += clipped.length;
    parts.push(`--- FILE: ${file} ---\n${clipped}`);
  }

  return parts.join('\n\n');
}

export function extractFileHints(text: string): string[] {
  const matches = new Set<string>();
  const patterns = [
    /(?:^|\s)([A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|yml|yaml|py|go|rs|java|kt|rb|php))(?::\d+)?/gm,
    /(?:FAIL|Error|at|❯)\s+([A-Za-z0-9_./-]+)(?::\d+)?/gm
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const candidate = match[1].replace(/^\//, '');
      if (!candidate.includes('node_modules')) matches.add(candidate);
    }
  }
  return [...matches].slice(0, 30);
}

function addCandidates(repoRoot: string, relativePath: string, config: FixerConfig, out: Set<string>): void {
  const absolute = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolute)) return;
  const stat = fs.statSync(absolute);
  if (stat.isFile()) {
    if (isReadableCandidate(relativePath, config)) out.add(relativePath);
    return;
  }
  if (!stat.isDirectory()) return;
  for (const entry of fs.readdirSync(absolute)) {
    addCandidates(repoRoot, path.join(relativePath, entry), config, out);
  }
}

function isReadableCandidate(file: string, config: FixerConfig): boolean {
  const normalized = file.replace(/\\/g, '/');
  const allowed = config.allowedPaths.some((pattern) => minimatch(normalized, pattern, { dot: true }));
  const blocked = config.blockedPaths.some((pattern) => minimatch(normalized, pattern, { dot: true }));
  return allowed && !blocked;
}
