import type { AiFixRequest, AiFixResponse } from '../types.js';
import { buildPrompt } from './prompt.js';
import { parseAiJson } from './responseParser.js';

export const anthropicProvider = {
  async generateFix(request: AiFixRequest): Promise<AiFixResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required for AI_PROVIDER=anthropic');
    const model = process.env.AI_MODEL || 'claude-sonnet-4-5';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_tokens: 8000,
        messages: [{ role: 'user', content: buildPrompt(request) }]
      })
    });

    const body = await response.text();
    if (!response.ok) throw new Error(`Anthropic API error ${response.status}: ${body}`);
    const parsed = JSON.parse(body) as { content?: Array<{ type: string; text?: string }> };
    const text = parsed.content?.map((item) => item.text ?? '').join('\n') ?? body;
    return parseAiJson(text);
  }
};
