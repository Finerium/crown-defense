/**
 * Model-agnostic LLM serving abstraction (ADR-002). The PRODUCTION model is a self-hosted open-weight
 * model on-premise (SGLang/vLLM); for THIS build's dev/test + the demo it is the DeepSeek cloud API
 * (OpenAI-API-compatible). Swapping prod<->dev is a CONFIG change behind this one interface — never a code
 * change, and the cloud API is NEVER the production answer (security telemetry must not egress; AC-COMP-01).
 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
export interface LLMGenerateOpts {
  temperature?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
}
export interface LLMResult {
  text: string;
  model: string;
}
export interface LLMClient {
  readonly modelId: string;
  generate(messages: LLMMessage[], opts?: LLMGenerateOpts): Promise<LLMResult>;
}

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  maxRetries?: number;
}

/** Read the dev/test LLM config from env. Returns null if unset (then the layer degrades gracefully). */
export function llmConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LLMConfig | null {
  const apiKey = env.DEEPSEEK_API_KEY;
  const baseUrl = env.LLM_API_BASE_URL;
  const model = env.LLM_MODEL;
  if (!apiKey || !baseUrl || !model) return null;
  return { apiKey, baseUrl, model, timeoutMs: 30000, maxRetries: 2 };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** OpenAI-compatible chat client (DeepSeek for the build). Timeout + bounded retry/backoff (AC-FAIL-06). */
export class OpenAICompatClient implements LLMClient {
  private cfg: LLMConfig;
  constructor(cfg: LLMConfig) {
    this.cfg = cfg;
  }
  get modelId(): string {
    return this.cfg.model;
  }

  async generate(messages: LLMMessage[], opts: LLMGenerateOpts = {}): Promise<LLMResult> {
    const url = `${this.cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const body = {
      model: this.cfg.model,
      messages,
      temperature: opts.temperature ?? 0.2,
      ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    };
    const maxRetries = this.cfg.maxRetries ?? 2;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? this.cfg.timeoutMs ?? 30000);
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${this.cfg.apiKey}` },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        clearTimeout(to);
        if (!resp.ok) throw new Error(`LLM HTTP ${resp.status}`);
        const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
        return { text: json.choices?.[0]?.message?.content ?? '', model: this.cfg.model };
      } catch (e) {
        clearTimeout(to);
        lastErr = e;
        if (attempt < maxRetries) await sleep(250 * (attempt + 1)); // bounded backoff
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('LLM generate failed');
  }
}

/** Deterministic in-memory client for tests (no network). The responder maps the prompt to a fixed output. */
export class MockLLM implements LLMClient {
  private responder: (messages: LLMMessage[]) => string;
  readonly modelId: string;
  constructor(responder: (messages: LLMMessage[]) => string, modelId = 'mock-onprem-20b') {
    this.responder = responder;
    this.modelId = modelId;
  }
  async generate(messages: LLMMessage[]): Promise<LLMResult> {
    return { text: this.responder(messages), model: this.modelId };
  }
}
