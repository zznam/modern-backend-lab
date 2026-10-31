export function protectionHeaders(baseURL: string): Record<string, string> {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!secret) return {};
  const url = new URL(baseURL);
  if (url.protocol !== 'https:' || url.port || url.origin !== baseURL
    || !/^modern-backend(?:-lab)?-[a-z0-9]{9}-zznams-projects\.vercel\.app$/.test(url.hostname)) {
    throw new Error('Protection credentials require this project\'s immutable HTTPS deployment origin.');
  }
  return { 'x-vercel-protection-bypass': secret };
}

export async function verifyRemoteTarget(baseURL: string): Promise<void> {
  const headers = protectionHeaders(baseURL);
  let response;
  try {
    response = await fetch(new URL('/api/v1/ready', baseURL), {
      headers, redirect: 'error', signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('Remote readiness request failed; check deployment access and availability.');
  }
  if (!response.ok) throw new Error(`Remote lab readiness failed (HTTP ${response.status}).`);
  const readiness = await response.json() as {
    status?: string;
    deployment?: { id?: string; commitSha?: string };
    adapters?: Record<string, { mode?: string; status?: string }>;
  };
  if (readiness.status !== 'READY' || ['postgres', 'redis'].some(name =>
    readiness.adapters?.[name]?.mode !== 'IN_MEMORY_FALLBACK'
    || readiness.adapters?.[name]?.status !== 'FALLBACK_READY')) {
    throw new Error('Remote E2E requires a ready simulator deployment with both adapters in IN_MEMORY_FALLBACK mode.');
  }
  for (const [field, expected] of [
    ['id', process.env.E2E_EXPECTED_DEPLOYMENT_ID],
    ['commitSha', process.env.E2E_EXPECTED_COMMIT_SHA],
  ] as const) {
    if (expected && readiness.deployment?.[field] !== expected) {
      throw new Error(`Remote deployment ${field} does not match the requested release.`);
    }
  }
}
