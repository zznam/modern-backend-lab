/** Validation at the HTTP boundary keeps intentionally expensive labs bounded. */
export class InputError extends Error {
  readonly status = 400;
}

export function objectInput(value: unknown, name: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InputError(`${name} must be an object`);
  }
  return value as Record<string, any>;
}

export function integerInput(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new InputError(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export function queryInteger(value: unknown, name: string, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new InputError(`${name} must be an integer`);
  return integerInput(Number(value), name, min, max);
}

export function stringInput(value: unknown, name: string, max = 500): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    throw new InputError(`${name} must be a nonempty string of at most ${max} characters`);
  }
  return value;
}

export function experimentInput(body: unknown): { experimentId: string; params: Record<string, any> } {
  const input = objectInput(body, 'Request body');
  const experimentId = stringInput(input.experimentId, 'experimentId', 80);
  const params = objectInput(input.params === undefined ? {} : input.params, 'params');
  const bounds: Record<string, [number, number]> = {
    limit: [1, 80000], iterations: [1, 100000], concurrency: [1, 100],
    cpuCores: [1, 256], keyCount: [1, 5000], totalRequests: [1, 5000],
    mode: [0, 0o7777], createdMode: [0, 0o7777], umask: [0, 0o777],
    clusterSize: [3, 9], availableNodes: [1, 8], pauseMs: [0, 20000],
    projectionBatch: [0, 3], onCallDoctors: [2, 10],
    producerRate: [1, 100], consumerRate: [1, 100], queueCapacity: [1, 100],
    sloBasisPoints: [9000, 9999], longErrorBasisPoints: [0, 10000], shortErrorBasisPoints: [0, 10000],
  };
  for (const [key, range] of Object.entries(bounds)) {
    if (params[key] !== undefined) integerInput(params[key], key, ...range);
  }
  if (experimentId === 'consensus-quorum') {
    const size = params.clusterSize ?? 5;
    if (size % 2 === 0) throw new InputError('clusterSize must be odd (3, 5, 7 or 9)');
    if ((params.availableNodes ?? Math.min(3, size - 1)) >= size) {
      throw new InputError('availableNodes must be smaller than clusterSize; the old leader is isolated');
    }
  }
  for (const key of ['clientIp', 'sqlPayload', 'ssrfUrl', 'searchQuery']) {
    if (params[key] !== undefined) stringInput(params[key], key);
  }
  // ABAC accepts complete, typed contexts so comparisons cannot fail open on NaN or missing attributes.
  const contexts = {
    subject: { id: 'string', department: 'string', clearanceLevel: 'number', isContractor: 'boolean' },
    resource: { id: 'string', ownerId: 'string', department: 'string', classificationLevel: 'number', status: 'string' },
    env: { currentHourUtc: 'number', isCorporateVpn: 'boolean', clientIp: 'string' },
  };
  for (const [name, fields] of Object.entries(contexts)) {
    if (params[name] === undefined) continue;
    const context = objectInput(params[name], name);
    for (const [field, type] of Object.entries(fields)) {
      if (typeof context[field] !== type) throw new InputError(`${name}.${field} must be a ${type}`);
      if (type === 'number') integerInput(context[field], `${name}.${field}`, field === 'currentHourUtc' ? 0 : 1, field === 'currentHourUtc' ? 23 : 5);
    }
    if (name === 'resource' && !['DRAFT', 'ACTIVE', 'ARCHIVED'].includes(context.status)) {
      throw new InputError('resource.status must be DRAFT, ACTIVE or ARCHIVED');
    }
  }
  return { experimentId, params };
}
