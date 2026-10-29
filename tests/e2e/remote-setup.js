// Remote experiments can write to configured adapters. Refuse to run this
// teaching suite against a deployment with a real PostgreSQL or Redis store.
export default async function verifyRemoteLab(config) {
  const baseURL = config.projects[0].use.baseURL;
  const response = await fetch(new URL('/api/v1/ready', baseURL), {
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Remote lab readiness failed (HTTP ${response.status}). No experiments were run.`);
  const readiness = await response.json();
  if (readiness.status !== 'READY' || ['postgres', 'redis'].some(name =>
    readiness.adapters?.[name]?.mode !== 'IN_MEMORY_FALLBACK'
    || readiness.adapters?.[name]?.status !== 'FALLBACK_READY')) {
    throw new Error('Remote E2E requires a ready simulator deployment with both adapters in IN_MEMORY_FALLBACK mode. No experiments were run.');
  }
  console.log(`Remote E2E target: ${baseURL} (ready; PostgreSQL and Redis use in-memory simulators)`);
}
