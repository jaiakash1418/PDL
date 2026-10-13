// Optional generative upgrade for the AI Query Workspace.
// Active ONLY when VITE_AI_* environment variables are present. When they are
// not, the workspace uses the local extractive search in retrieval.ts and this
// module reports isAiConfigured() === false. Nothing here is simulated.

import type { EvidenceItem } from './retrieval';

interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function readConfig(): AiConfig | null {
  const env = (import.meta as any).env ?? {};
  const baseUrl = env.VITE_AI_BASE_URL as string | undefined;
  const apiKey = env.VITE_AI_API_KEY as string | undefined;
  const model = (env.VITE_AI_MODEL as string | undefined) ?? 'gpt-4o-mini';
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey, model };
}

export function isAiConfigured(): boolean {
  return readConfig() !== null;
}

export function aiConfigSummary(): { configured: boolean; model?: string; baseUrl?: string } {
  const cfg = readConfig();
  if (!cfg) return { configured: false };
  return { configured: true, model: cfg.model, baseUrl: cfg.baseUrl };
}

const SYSTEM_PROMPT = `You are STRATAVEX, an evidence-first reporting assistant for geological, mining, production and safety records.
Rules you must never break:
- Only use facts contained in the provided CONTEXT passages.
- Cite every factual statement using the exact citation format already present in the context: Document Name → Section → Page Number.
- If the context does not contain the answer, reply exactly: "No verified record found in the available documents."
- If passages disagree, present BOTH values with their citations and state that they conflict. Never silently choose one.
- Never invent document names, page numbers, quotations, statistics or sources.`;

export async function generateAnswer(
  query: string,
  evidence: EvidenceItem[],
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const cfg = readConfig();
  if (!cfg) return { ok: false, error: 'No AI provider configured' };
  const context = evidence
    .map((e, i) => `[${i + 1}] ${e.docName} → ${e.section ?? 'General'} → Page ${e.pageNo}\n"${e.snippet}"`)
    .join('\n\n');
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.1,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `CONTEXT:\n${context}\n\nQUESTION: ${query}` },
        ],
      }),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const json = await res.json();
    const text: string = json?.choices?.[0]?.message?.content?.trim() ?? '';
    if (!text) return { ok: false, error: 'Empty response' };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'network error' };
  }
}
