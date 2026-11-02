import { verifyRemoteTarget } from './remote-target.ts';

// Check both before experiments and after the suite so a mismatched release
// or a live database can never be reported as a successful simulator run.
export default async function verifyRemoteLab(config) {
  const baseURL = config.projects[0].use.baseURL;
  await verifyRemoteTarget(baseURL);
  console.log(`Remote E2E target: ${baseURL} (ready; PostgreSQL and Redis use in-memory simulators)`);
  return () => verifyRemoteTarget(baseURL);
}
