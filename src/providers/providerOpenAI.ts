import type { AiFixRequest, AiFixResponse } from '../types.js';
import { buildPrompt } from './prompt.js';
import { parseAiJson } from './responseParser.js';

export const openAiProvider = {
  async generateFix(request: AiFixRequest): Promise<AiFixResponse> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is required for AI_PROVIDER=openai');
    const model = process.env.AI_MODEL || 'gpt-5.1';

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        input: buildPrompt(request),
        text: { format: { type: 'json_object' } }
      })
    });

    const body = await response.text();
    if (!response.ok) throw new Error(`OpenAI API error ${response.status}: ${body}`);
    const parsed = JSON.parse(body) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    const text = parsed.output_text ?? parsed.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? '').join('\n') ?? body;
    return parseAiJson(text);
  }
};
