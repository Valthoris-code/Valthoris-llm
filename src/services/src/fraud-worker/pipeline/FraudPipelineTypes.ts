/**
 * fraud-worker/pipeline/FraudPipelineTypes.ts
 *
 * Internal types shared across the fraud pipeline components.
 * These are not exported from the package root; they are implementation details.
 */

import { FraudEvent } from '../../types/fraud';

/** Context object threaded through each pipeline stage */
export interface PipelineContext {
  event: FraudEvent;
  pipelineId: string;
  mode: 'auto' | 'manual';
  workflowRunId: string;
  /** ISO-8601 timestamp when this run started */
  startedAt: string;
}

/** Result of a single pipeline stage */
export type StageResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function stageOk<T>(value: T): StageResult<T> {
  return { ok: true, value };
}

export function stageFail<T = never>(error: string): StageResult<T> {
  return { ok: false, error };
}
