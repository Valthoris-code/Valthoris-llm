/**
 * fraud-worker/pipeline/FraudAnalyzer.ts
 *
 * Analyses a fraud event using the AI service and returns a structured verdict.
 *
 * The analysis follows a chain-of-thought prompt strategy:
 *   1. System prompt establishes the expert persona and output format.
 *   2. User prompt presents the raw event content and metadata.
 *   3. The AI response is parsed into a FraudAnalysisResult.
 */

import { AiService } from '../../services/ai/AiService';
import { FraudAnalysisResult, FraudEventPayload, FraudEventType, FraudVerdict } from '../../types/fraud';

const SYSTEM_PROMPT = `You are an expert fraud analyst at Valthoris, a digital safety platform.
Your task is to analyse potentially fraudulent digital content and produce a structured verdict.

You MUST respond with a valid JSON object that matches this exact schema:
{
  "verdict": "fraud" | "suspicious" | "legitimate" | "unknown",
  "confidenceScore": <integer 0-100>,
  "justification": "<one concise paragraph explaining your reasoning>",
  "riskSignals": ["<signal1>", "<signal2>", ...],
  "recommendedAction": "<what the user should do, or null if legitimate>"
}

Verdict definitions:
- "fraud": Strong evidence of fraudulent intent (phishing, scam, malware distribution, etc.)
- "suspicious": Patterns consistent with fraud but insufficient evidence for certainty
- "legitimate": No fraud indicators found
- "unknown": Insufficient information to make a determination

Risk signals are short phrases identifying specific red flags, e.g.:
  "urgent language designed to panic the user"
  "domain registered less than 7 days ago"
  "IBAN mismatch with stated recipient"
  "cryptocurrency wallet flagged for scam activity"

Respond ONLY with the JSON object. Do not include any prose outside the JSON.`;

function buildUserPrompt(
  eventType: FraudEventType,
  payload: FraudEventPayload,
): string {
  const lines = [
    `Event type: ${eventType}`,
    `Content to analyse:`,
    `"""`,
    payload.content,
    `"""`,
  ];

  if (payload.metadata && Object.keys(payload.metadata).length > 0) {
    lines.push(`\nAdditional metadata:`);
    lines.push(JSON.stringify(payload.metadata, null, 2));
  }

  if (payload.source) {
    lines.push(`\nSource system: ${payload.source}`);
  }

  return lines.join('\n');
}

function parseAiResponse(raw: string, providerName: string): FraudAnalysisResult {
  // Strip markdown code fences if the model wrapped the JSON
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error(`AI response is not valid JSON: ${cleaned.slice(0, 200)}`);
  }

  const verdict = parsed['verdict'] as FraudVerdict;
  if (!['fraud', 'suspicious', 'legitimate', 'unknown'].includes(verdict)) {
    throw new Error(`Invalid verdict in AI response: ${verdict}`);
  }

  const confidenceScore = Number(parsed['confidenceScore']);
  if (isNaN(confidenceScore) || confidenceScore < 0 || confidenceScore > 100) {
    throw new Error(`Invalid confidenceScore in AI response: ${parsed['confidenceScore']}`);
  }

  const justification = String(parsed['justification'] ?? '');
  const riskSignals: string[] = Array.isArray(parsed['riskSignals'])
    ? (parsed['riskSignals'] as unknown[]).map(String)
    : [];
  const recommendedAction: string | null = parsed['recommendedAction']
    ? String(parsed['recommendedAction'])
    : null;

  return {
    verdict,
    confidenceScore,
    justification,
    riskSignals,
    recommendedAction,
    aiProvider: providerName,
    aiResponseSummary: raw.slice(0, 1_000),
  };
}

export class FraudAnalyzer {
  constructor(private readonly ai: AiService) {}

  async analyse(
    eventType: FraudEventType,
    payload: FraudEventPayload,
  ): Promise<FraudAnalysisResult> {
    const userPrompt = buildUserPrompt(eventType, payload);

    const response = await this.ai.complete({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      maxTokens: 512,
      temperature: 0.0,
    });

    const result = parseAiResponse(response.content, response.provider);

    // Override aiProvider with the actual provider used (may differ from primary)
    return { ...result, aiProvider: response.provider };
  }
}
