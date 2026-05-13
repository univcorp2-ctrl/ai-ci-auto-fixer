import type { AiFixRequest, AiFixResponse } from '../types.js';

export const mockProvider = {
  async generateFix(_request: AiFixRequest): Promise<AiFixResponse> {
    return {
      summary: 'Mock provider produced no patch.',
      patch: ''
    };
  }
};
