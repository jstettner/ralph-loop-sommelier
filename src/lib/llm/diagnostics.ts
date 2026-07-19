// Anthropic returns cache-hit/creation token counts in provider metadata. Emit ONLY the
// counts to structured diagnostics so operators can confirm cache hits and whether caching
// pays off — never the prompt, memory, or any user content (specs/03, AC-LLM-6).

export interface CacheDiagnostics {
  model: string;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

type ProviderMetadata = Record<string, Record<string, unknown>> | undefined;

function toCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function buildCacheDiagnostics(model: string, metadata: ProviderMetadata): CacheDiagnostics | null {
  const anthropic = metadata?.anthropic;
  if (!anthropic) return null;
  const creation = anthropic.cacheCreationInputTokens;
  const read = anthropic.cacheReadInputTokens;
  if (creation === undefined && read === undefined) return null;
  return { model, cacheCreationInputTokens: toCount(creation), cacheReadInputTokens: toCount(read) };
}

export function recordCacheMetrics(model: string, metadata: ProviderMetadata): void {
  const diagnostics = buildCacheDiagnostics(model, metadata);
  if (diagnostics) console.info(`[llm.cache] ${JSON.stringify(diagnostics)}`);
}
