import { execa } from 'execa';
import type { AiFixRequest, AiFixResponse } from '../types.js';
import { buildPrompt } from './prompt.js';
import { parseAiJson } from './responseParser.js';

export const commandProvider = {
  async generateFix(request: AiFixRequest): Promise<AiFixResponse> {
    const command = process.env.AI_FIX_COMMAND;
    if (!command) {
      throw new Error('AI_PROVIDER=command requires AI_FIX_COMMAND. Example: AI_FIX_COMMAND="codex exec --json"');
    }

    const input = JSON.stringify({ prompt: buildPrompt(request), request }, null, 2);
    const result = await execa(command, {
      input,
      shell: true,
      reject: true,
      all: true,
      env: process.env
    });

    return parseAiJson(result.stdout || result.all || '');
  }
};
