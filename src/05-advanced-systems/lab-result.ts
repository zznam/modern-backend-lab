/** A common display contract for deterministic, in-memory teaching models. */
export interface LabResult {
  model: string;
  summary: string;
  metrics: { label: string; value: number | string; hint: string }[];
  steps: { title: string; detail: string; state: 'ok' | 'warning' | 'blocked' }[];
}

export function boundedInteger(value: number, name: string, min: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer between ${min} and ${max}`);
  }
}
