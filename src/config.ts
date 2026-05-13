import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { z } from 'zod';
import type { FixerConfig } from './types.js';

const ConfigSchema = z.object({
  maxAttempts: z.number().int().min(1).max(10).default(3),
  testCommand: z.string().min(1).default('npm test'),
  buildCommand: z.string().optional(),
  dryRun: z.boolean().default(false),
  allowedPaths: z.array(z.string()).default(['src/**', 'test/**', 'tests/**', '__tests__/**', 'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'tsconfig*.json', 'vite.config.*', 'vitest.config.*']),
  blockedPaths: z.array(z.string()).default(['.github/**', '.env', '.env.*', '**/*.pem', '**/*.key', '**/*.p12', '**/*.crt', '**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.webp', '**/*.zip', '**/*.tar', '**/*.gz']),
  maxLogChars: z.number().int().min(1000).max(200000).default(60000)
});

export function loadConfig(repoRoot: string): FixerConfig {
  const configPath = path.join(repoRoot, '.ai-fixer.yml');
  if (!fs.existsSync(configPath)) {
    return ConfigSchema.parse({});
  }

  const parsed = yaml.load(fs.readFileSync(configPath, 'utf8')) ?? {};
  return ConfigSchema.parse(parsed);
}
