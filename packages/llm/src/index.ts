/**
 * @crown/llm — the on-premise LLM orchestration layer (Phase 4, ADR-002/008). Model-agnostic serving
 * abstraction (DeepSeek cloud for dev/test; self-hosted SGLang/vLLM in production behind the same
 * interface), RAG over the IR playbook, a faithfulness gate, and structured C7 output. ADVISORY ONLY —
 * it never emits an ActionRecord or an AgentCommand; it degrades gracefully when the model is down.
 */
export {
  type LLMClient,
  type LLMConfig,
  type LLMGenerateOpts,
  type LLMMessage,
  type LLMResult,
  MockLLM,
  OpenAICompatClient,
  llmConfigFromEnv,
} from './client.js';
export {
  IR_PLAYBOOK,
  type PlaybookPassage,
  passageById,
  retrieve,
  tokenize,
} from './playbook.js';
export {
  type ClaimVerdict,
  checkFaithfulness,
  DEFAULT_FAITHFULNESS,
  type FaithfulnessConfig,
  type FaithfulnessResult,
} from './faithfulness.js';
export {
  type AnalysisStatus,
  deriveBlastRadius,
  extractJson,
  type IncidentAnalysis,
  LLMOrchestrator,
  type OrchestratorOptions,
} from './orchestrator.js';
