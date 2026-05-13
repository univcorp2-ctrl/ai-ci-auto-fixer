import { z } from 'zod';
import type { AiFixResponse } from '../types.js';

const ResponseSchema = z.object({
  summary: z.string().min(1),
  patch: z.string()
});

export function parseAiJson(text: string): AiFixResponse {
  const cleaned = stripCodeFence(text.trim());
  try {
    return ResponseSchema.parse(JSON.parse(cleaned));
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return ResponseSchema.parse(JSON.parse(cleaned.slice(start, end + 1)));
    }
    throw new Error(`AI response was not valid JSON: ${text.slice(0, 1000)}`);
  }
}

function stripCodeFence(value: string): string {
  return value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}
