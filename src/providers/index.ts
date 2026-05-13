import type { AiFixRequest, AiFixResponse, AiProviderName } from '../types.js';
import { commandProvider } from './providerCommand.js';
import { mockProvider } from './providerMock.js';
import { openAiProvider } from './providerOpenAI.js';
import { anthropicProvider } from './providerAnthropic.js';

export interface AiProvider {
  generateFix(request: AiFixRequest): Promise<AiFixResponse>;
}

export function getProvider(): AiProvider {
  const name = (process.env.AI_PROVIDER ?? 'command') as AiProviderName;
  if (name === 'openai') return openAiProvider;
  if (name === 'anthropic') return anthropicProvider;
  if (name === 'mock') return mockProvider;
  if (name === 'command') return commandProvider;
  throw new Error(`Unsupported AI_PROVIDER: ${name}`);
}
