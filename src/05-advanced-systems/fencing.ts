import { boundedInteger, type LabResult } from './lab-result.js';

export class FencedResource {
  private highestToken = 0;
  value = 'initial';
  write(token: number, value: string): boolean {
    boundedInteger(token, 'token', 1, Number.MAX_SAFE_INTEGER);
    if (token < this.highestToken) return false;
    this.highestToken = token;
    this.value = value;
    return true;
  }
}

export function runFencingLab(pauseMs = 1500) {
  boundedInteger(pauseMs, 'pauseMs', 0, 20000);
  const leaseTtlMs = 1000;
  const expired = pauseMs >= leaseTtlMs;
  const resource = new FencedResource();
  resource.write(1, 'worker-A:first');
  let unfencedValue = 'worker-A:first';
  if (expired) {
    resource.write(2, 'worker-B:new');
    unfencedValue = 'worker-B:new';
  }
  const beforeResume = unfencedValue;
  unfencedValue = 'worker-A:resumed';
  const staleWriteAccepted = resource.write(1, 'worker-A:resumed');
  return {
    model: 'Logical clock, one lease and one protected resource. Token issuance is assumed monotonic and durable in a real system.',
    summary: expired ? 'A storage-side token check rejects the resumed stale owner after a newer owner has written.' : 'The lease has not expired; no replacement owner is admitted and the original owner may write.',
    metrics: [
      { label: 'Worker pause', value: `${pauseMs} ms`, hint: `Lease TTL: ${leaseTtlMs} ms` },
      { label: 'New owner admitted', value: expired ? 'Yes' : 'No', hint: 'Acquisition requires lease expiry' },
      { label: 'Resumed write', value: staleWriteAccepted ? 'Accepted' : 'Rejected', hint: 'Decision enforced at the protected resource' },
    ],
    steps: [
      { title: 'Acquire token 1', detail: 'Worker A writes, then pauses while holding its lease.', state: 'ok' },
      { title: expired ? 'Lease expires; issue token 2' : 'Lease remains valid', detail: expired ? 'Worker B acquires a newer token and writes worker-B:new.' : 'Worker B cannot acquire the lease yet.', state: expired ? 'warning' : 'ok' },
      { title: 'Worker A resumes', detail: `Without fencing: ${beforeResume} → ${unfencedValue}. With fencing: ${resource.value}.`, state: staleWriteAccepted ? 'ok' : 'blocked' },
    ],
    expired, staleWriteAccepted, unfencedValue, fencedValue: resource.value,
  } satisfies LabResult & Record<string, unknown>;
}
