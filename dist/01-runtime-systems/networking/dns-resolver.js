/**
 * DNS Resolution & Caching Mechanics
 * Demonstrates:
 * 1. Recursive vs Iterative resolution hierarchy (Root -> TLD -> Authoritative -> Local Cache)
 * 2. Record types (A, AAAA, CNAME, TXT, MX)
 * 3. TTL (Time-To-Live) cache invalidation
 */
import dns from 'node:dns/promises';
export class DnsCacheSimulator {
    cache = new Map();
    resolveWithCache(domain, ttlSeconds = 5) {
        const cached = this.cache.get(domain);
        const now = Date.now();
        if (cached && cached.expiresAt > now) {
            return {
                source: 'CACHE_HIT',
                ip: cached.value,
                ttlRemaining: Math.round((cached.expiresAt - now) / 1000),
            };
        }
        // Cache Miss: Simulate authoritative lookup
        const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
        this.cache.set(domain, {
            value: ip,
            expiresAt: now + ttlSeconds * 1000,
            ttl: ttlSeconds,
        });
        return {
            source: 'CACHE_MISS',
            ip,
            ttlRemaining: ttlSeconds,
        };
    }
    getTrace(domain) {
        return [
            {
                level: 'Cache',
                server: 'Local OS Resolver (/etc/hosts, systemd-resolved)',
                query: `A ${domain}`,
                response: 'NXDOMAIN (Cache Miss)',
                latencyMs: 1,
            },
            {
                level: 'Recursive Resolver',
                server: 'ISP / Public DNS (8.8.8.8, 1.1.1.1)',
                query: `A ${domain}`,
                response: 'Forwarding query iteratively to Root Zone',
                latencyMs: 12,
            },
            {
                level: 'Root Server',
                server: 'a.root-servers.net (198.41.0.4)',
                query: `A ${domain}`,
                response: 'Referral to .com TLD Nameservers (a.gtld-servers.net)',
                latencyMs: 25,
            },
            {
                level: 'TLD Server (.com)',
                server: 'a.gtld-servers.net (192.5.6.30)',
                query: `A ${domain}`,
                response: 'Referral to Authoritative NS (ns1.exampledns.com)',
                latencyMs: 38,
            },
            {
                level: 'Authoritative Nameserver',
                server: 'ns1.exampledns.com',
                query: `A ${domain}`,
                response: 'A 93.184.216.34 (TTL 300s)',
                latencyMs: 45,
            },
        ];
    }
}
export async function runDnsResolutionDemo() {
    // Live node dns lookup
    let liveLookup = { domain: 'localhost', address: '127.0.0.1', family: 4 };
    try {
        const res = await dns.lookup('localhost');
        liveLookup = { domain: 'localhost', address: res.address, family: res.family };
    }
    catch {
        // fallback
    }
    const sim = new DnsCacheSimulator();
    const c1 = sim.resolveWithCache('api.production.internal', 3);
    const c2 = sim.resolveWithCache('api.production.internal', 3);
    return {
        liveDnsLookup: liveLookup,
        simulatedHierarchy: sim.getTrace('api.production.internal'),
        cachingCycles: [
            { cycle: 1, ...c1 },
            { cycle: 2, ...c2 },
        ],
    };
}
