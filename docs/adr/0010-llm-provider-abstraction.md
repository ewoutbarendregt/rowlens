# ADR-0010: LLM provider abstraction and data minimisation

- **Status**: proposed — **provider choice is yours**
- **Date**: 2026-11-01

## Context

LLMs are used only to turn structured metrics into plain-language explanations and drill suggestions.
Commercial APIs are fine initially; switching to a self-hosted model must be configuration only. Prefer EU
processing. Version prompts; log provider/model/prompt version per output; no personal data in logs. No
video/names/e-mails to an AI provider unless enabled for the tenant and documented.

## Decision

- Interface `ExplanationProvider.generate(input: ExplanationInput) → ExplanationOutput` in the worker.
  Default adapter speaks the **OpenAI-compatible Chat Completions** API (works with vLLM, Ollama, LiteLLM,
  most commercial providers); vendor-native adapters may be added behind the same interface.
  Config: `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`, `LLM_REGION`.
- **Input is pseudonymous structured data only**: `{boat_class, perspective, seat: "2", locale, metrics[],
  refused[], reference_deltas[]}`. No names, e-mails, club names, free-text notes or video. A unit test
  asserts the serialised payload contains no value from the user/club tables.
- **Feature flag per club** `ai_explanations` (default **off**); enabling it is an audited club-admin action
  and the provider is listed in `docs/privacy/processors.md`.
- **Prompts** live in `worker/prompts/<name>/v<semver>.md` with front-matter (model hints, output JSON
  schema). Output is JSON-schema-validated; invalid output → retry once → "explanation unavailable".
- Each output stores `provider, model, prompt_name, prompt_version, prompt_sha256, input_sha256, tokens,
  latency`. Logs contain the same minus content.
- An **eval set** of metric fixtures with expected properties (mentions the refused metric as refused,
  never invents a number, correct locale) runs in CI against a recorded/stubbed provider, and nightly against
  the live one.

## Candidates to decide between (EU processing)

- Mistral (EU-headquartered, EU hosting).
- Anthropic Claude via a cloud provider's EU region (e.g. AWS Bedrock or Google Vertex AI in the EU).
- Azure OpenAI with an EU data zone.
- Self-hosted open-weights model behind vLLM (no external processor; needs GPU).

Check each one's DPA, EU data residency and no-training terms before choosing.
