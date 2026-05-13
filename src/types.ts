export type AiProviderName = 'openai' | 'anthropic' | 'command' | 'mock';

export interface FixerConfig {
  maxAttempts: number;
  testCommand: string;
  buildCommand?: string;
  dryRun: boolean;
  allowedPaths: string[];
  blockedPaths: string[];
  maxLogChars: number;
}

export interface FailedRunContext {
  owner: string;
  repo: string;
  runId: string;
  baseRef: string;
  repoRoot: string;
  logs: string;
  changedFilesHint: string[];
  attempt: number;
  previousFailure?: string;
}

export interface AiFixRequest {
  context: FailedRunContext;
  config: FixerConfig;
  repoSnapshot: string;
  gitStatus: string;
}

export interface AiFixResponse {
  summary: string;
  patch: string;
}

export interface PullRequestResult {
  branch: string;
  url: string;
  files: string[];
}
