import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertAllowedFiles, buildRepoSnapshot, containsSecretLikeContent, extractFileHints, isAllowedFile, loadConfig, parseAiJson, parseArgs, trimLog } from '../src/cli.mjs';

describe('core helpers', () => {
  it('parses args', () => {
    expect(parseArgs(['--owner', 'octo', '--org'])).toEqual({ owner: 'octo', org: true });
  });

  it('trims long logs while keeping head and tail', () => {
    const out = trimLog('a'.repeat(100) + 'b'.repeat(100), 50);
    expect(out).toContain('LOG TRUNCATED');
    expect(out.length).toBeGreaterThan(50);
  });

  it('extracts file hints from CI logs', () => {
    expect(extractFileHints('FAIL test/autoTrader.test.ts:45 expected length')).toContain('test/autoTrader.test.ts');
  });

  it('checks allowed and blocked files', () => {
    const config = loadConfig('/tmp/not-existing-ai-fixer-config');
    expect(isAllowedFile('src/index.ts', config)).toBe(true);
    expect(isAllowedFile('.github/workflows/ci.yml', config)).toBe(false);
    expect(() => assertAllowedFiles(['.env'], config)).toThrow();
  });

  it('detects secret-like content', () => {
    expect(containsSecretLikeContent('token=ghp_abcdefghijklmnopqrstuvwxyz1234567890')).toBe(true);
  });

  it('parses AI JSON responses', () => {
    expect(parseAiJson('```json\n{"summary":"ok","patch":"diff --git a/a b/a"}\n```').summary).toBe('ok');
  });

  it('builds a safe repo snapshot', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-fixer-'));
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src/index.ts'), 'export const x = 1;');
    fs.writeFileSync(path.join(dir, '.env'), 'SECRET=1');
    const snap = buildRepoSnapshot(dir, loadConfig(dir), ['src/index.ts', '.env']);
    expect(snap).toContain('src/index.ts');
    expect(snap).not.toContain('SECRET=1');
  });
});
