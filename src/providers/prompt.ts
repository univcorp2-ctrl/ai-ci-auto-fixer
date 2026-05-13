import type { AiFixRequest } from '../types.js';

export function buildPrompt(request: AiFixRequest): string {
  return `You are an autonomous CI repair agent. Fix the repository so the failing GitHub Actions run passes.

Rules:
- Return only JSON with keys: summary, patch.
- patch must be a valid unified git diff starting with diff --git.
- Make the smallest safe change.
- Do not modify blocked files.
- Do not add secrets or credentials.
- Prefer fixing product code over weakening tests unless the test is plainly wrong.
- The patch must only touch allowed paths.

Repository: ${request.context.owner}/${request.context.repo}
Run ID: ${request.context.runId}
Attempt: ${request.context.attempt}
Base ref: ${request.context.baseRef}

Allowed paths:
${request.config.allowedPaths.map((p) => `- ${p}`).join('\n')}

Blocked paths:
${request.config.blockedPaths.map((p) => `- ${p}`).join('\n')}

Previous failure:
${request.context.previousFailure ?? '(none)'}

Git status:
${request.gitStatus || '(clean)'}

CI logs:
${request.context.logs}

Relevant repository files:
${request.repoSnapshot}
`;
}
