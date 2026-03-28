import { logger } from '../lib/logger';
// LLM SDKs loaded lazily to prevent crash if a package is not installed
let _OpenAI: typeof import('openai').default | null = null;
let _Anthropic: typeof import('@anthropic-ai/sdk').default | null = null;
try { _OpenAI = require('openai').default || require('openai'); } catch { logger.warn('openai package not found'); }
try { _Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk'); } catch { logger.warn('@anthropic-ai/sdk package not found'); }

interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface LLMResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

interface LLMProvider {
  complete(messages: LLMMessage[], options?: { maxTokens?: number; temperature?: number }): Promise<LLMResponse>;
  name: string;
}

// OpenAI provider (default: gpt-4o-mini for cost efficiency)
class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  name = 'openai';

  constructor() {
    if (!_OpenAI) throw new Error("openai package not installed"); this.client = new (_OpenAI as any)({ apiKey: process.env.LLM_API_KEY });
  }

  async complete(messages: LLMMessage[], options: { maxTokens?: number; temperature?: number } = {}): Promise<LLMResponse> {
    const model = process.env.LLM_MODEL || 'gpt-4o-mini';
    const response = await this.client.chat.completions.create({
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: options.maxTokens ?? 2000,
      temperature: options.temperature ?? 0.2,
    });

    return {
      content: response.choices[0]?.message?.content ?? '',
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      model,
    };
  }
}

// Anthropic provider (Claude Haiku for cost efficiency)
class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  name = 'anthropic';

  constructor() {
    if (!_Anthropic) throw new Error("@anthropic-ai/sdk package not installed"); this.client = new (_Anthropic as any)({ apiKey: process.env.LLM_API_KEY });
  }

  async complete(messages: LLMMessage[], options: { maxTokens?: number; temperature?: number } = {}): Promise<LLMResponse> {
    const model = process.env.LLM_MODEL || 'claude-haiku-4-5-20251001';
    const systemMessage = messages.find(m => m.role === 'system')?.content;
    const userMessages = messages.filter(m => m.role !== 'system');

    const response = await this.client.messages.create({
      model,
      max_tokens: options.maxTokens ?? 2000,
      temperature: options.temperature ?? 0.2,
      system: systemMessage,
      messages: userMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    });

    const textBlock = response.content.find(b => b.type === 'text');
    return {
      content: textBlock?.type === 'text' ? textBlock.text : '',
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model,
    };
  }
}

function createProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER || 'openai';
  switch (provider) {
    case 'anthropic': return new AnthropicProvider();
    case 'openai':
    default: return new OpenAIProvider();
  }
}

export const llm = createProvider();

// Token budget enforcement — keep costs predictable
const TOKEN_BUDGETS = {
  soe_classification: 500,
  soe_extraction: 3000,
  soe_sequencing: 1500,
  soe_confidence: 800,
  rehearsal_report: 2000,
};

export async function callLLM(
  stage: keyof typeof TOKEN_BUDGETS,
  messages: LLMMessage[],
  temperature = 0.2
): Promise<string> {
  const maxTokens = TOKEN_BUDGETS[stage];

  try {
    const result = await llm.complete(messages, { maxTokens, temperature });
    logger.info('LLM call complete', {
      stage,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });
    return result.content;
  } catch (err) {
    logger.error('LLM call failed', { stage, err });
    throw new Error(`LLM call failed for stage ${stage}: ${String(err)}`);
  }
}

export function parseJsonResponse<T>(raw: string): T {
  // Strip markdown code fences if present
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  return JSON.parse(cleaned) as T;
}
