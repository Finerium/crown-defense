# env-prep for Crown Defense (build codename: talos), hackathon-scoped

This creates the project's `.env` for the hackathon run (Phase 1 to Gate 6). Crown never sees your real secrets: you replace the few placeholders, then paste the whole block into your terminal from the project directory.

## What you actually have to provide (and what you do not)

For the hackathon run you fill only three values; the rest are pre-filled:
- The two database URLs are pre-filled with local defaults. The Orchestrator provisions matching local database containers in Phase 0, so you do NOT sign up for any database provider.
- The two signing secrets you generate locally in ten seconds with `openssl rand -hex 32` (run it once per secret). No signup.
- The DeepSeek API key is the only thing you sign up for. The LLM base URL and model are pre-filled.

So the only external account you create is DeepSeek. The exact signup links and steps are in the assistant's message.

## How to use

1. Generate two random secrets. Run this twice and keep the two outputs: `openssl rand -hex 32`
2. In the block below, replace `PLACEHOLDER_control_plane_token_signing_secret` and `PLACEHOLDER_audit_hmac_integrity_key` with those two outputs, and `PLACEHOLDER_deepseek_api_key` with your DeepSeek key.
3. `cd` into the project directory.
4. Paste the whole block into your terminal. It writes `.env`.

## Notes (read once)

- This `.env` is for the hackathon and dev and test build only. DeepSeek is the LLM for the demo (a cloud API, fine for dev and test). The production bank deployment is different: it uses the self-hosted on-premise open-weight model (data sovereignty, ADR-002) and the bank's real database credentials. The model-agnostic abstraction makes that swap a config change, not a rewrite. Do NOT use the DeepSeek API as the production answer.
- DeepSeek processes and stores API inputs on its own infrastructure (in China). For this hackathon you only send the SAFE simulator's synthetic incident data, never real bank data and never real malware, so this is fine. Just do not point it at anything sensitive.
- The two DB URLs use local default credentials; they are local-only and never exposed. The Orchestrator spins up the matching local containers in Phase 0.
- `.env` must NEVER be committed. The project foundation gitignores it.
- LLM model: `deepseek-v4-pro` is set by default (strong reasoning, best report and recovery-plan quality for the demo). Switch `LLM_MODEL` to `deepseek-v4-flash` if you want cheaper and faster generation at some quality cost.

```bash
# env-prep for Crown Defense (hackathon-scoped). Fill the three PLACEHOLDER values, then paste from the project directory.
cat > .env << 'EOF'
# Data stores (local defaults; the Orchestrator provisions matching local containers in Phase 0). ADR-013 keeps the two stores separate.
OPERATIONAL_DB_URL=postgresql://crowndefense:crowndefense@localhost:5432/crowndefense_operational
AUDIT_DB_URL=postgresql://crowndefense:crowndefense@localhost:5432/crowndefense_audit

# Signing secrets. Generate each with: openssl rand -hex 32
CONTROL_PLANE_TOKEN_SECRET=PLACEHOLDER_control_plane_token_signing_secret
AUDIT_INTEGRITY_KEY=PLACEHOLDER_audit_hmac_integrity_key

# LLM for the hackathon demo: DeepSeek cloud API (dev and test only, never the production answer).
DEEPSEEK_API_KEY=PLACEHOLDER_deepseek_api_key
LLM_API_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-v4-pro
EOF
echo ".env created in $(pwd)"
```
