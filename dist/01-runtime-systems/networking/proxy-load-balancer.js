/**
 * Reverse Proxies & Load Balancers (L4 vs L7)
 * Demonstrates:
 * 1. Layer 4 (Transport Layer: TCP Proxy, IP/Port routing without payload parsing)
 * 2. Layer 7 (Application Layer: HTTP inspection, path routing, header rewriting, SSL termination)
 * 3. Load Balancing Algorithms: Round Robin, Least Connections, IP Hash
 */
export class LoadBalancer {
    nodes;
    currentIndex = 0;
    constructor(nodes) {
        this.nodes = nodes;
    }
    getHealthyNodes() {
        return this.nodes.filter((n) => n.healthy);
    }
    selectNode(strategy, clientIp = '127.0.0.1') {
        const pool = this.getHealthyNodes();
        if (pool.length === 0)
            throw new Error('502 Bad Gateway: No healthy upstream backends');
        switch (strategy) {
            case 'ROUND_ROBIN': {
                const node = pool[this.currentIndex % pool.length];
                this.currentIndex = (this.currentIndex + 1) % pool.length;
                return node;
            }
            case 'LEAST_CONNECTIONS': {
                // Pick node with lowest active connection count
                let least = pool[0];
                for (let i = 1; i < pool.length; i++) {
                    if (pool[i].activeConnections < least.activeConnections) {
                        least = pool[i];
                    }
                }
                return least;
            }
            case 'IP_HASH': {
                // Hash client IP to ensure sticky session to same backend
                let hash = 0;
                for (let i = 0; i < clientIp.length; i++) {
                    hash = (hash << 5) - hash + clientIp.charCodeAt(i);
                    hash |= 0;
                }
                const index = Math.abs(hash) % pool.length;
                return pool[index];
            }
        }
    }
    recordConnectionStart(nodeId) {
        const node = this.nodes.find((n) => n.id === nodeId);
        if (node)
            node.activeConnections++;
    }
    recordConnectionEnd(nodeId) {
        const node = this.nodes.find((n) => n.id === nodeId);
        if (node && node.activeConnections > 0)
            node.activeConnections--;
    }
    getClusterStatus() {
        return this.nodes.map((n) => ({ ...n }));
    }
}
export function compareL4VsL7Architecture() {
    return {
        layer4: {
            name: 'Layer 4 Load Balancer (TCP / UDP)',
            operatesAt: 'OSI Transport Layer (IP + Port)',
            capabilities: [
                'Direct TCP routing without decrypting TLS',
                'Cannot read HTTP headers, cookies, or URI paths',
                'Stateful packet NAT (Network Address Translation)',
                'Extremely low CPU overhead and high throughput',
            ],
            performance: 'Sub-millisecond packet forwarding, millions of packets/sec per node',
            useCases: 'High-throughput database proxies, gaming servers, ingress gateways (HAProxy TCP mode, AWS NLB)',
        },
        layer7: {
            name: 'Layer 7 Reverse Proxy (HTTP / HTTPS / gRPC)',
            operatesAt: 'OSI Application Layer',
            capabilities: [
                'SSL / TLS Termination & Certificate management',
                'Path-based routing (e.g. /api -> backend, /static -> S3/CDN)',
                'Header injection & rewriting (X-Forwarded-For, X-Trace-Id)',
                'Authentication verification & Rate limiting at the edge',
                'Web Application Firewall (WAF) inspections',
            ],
            performance: 'Moderate CPU overhead due to TLS decryption & HTTP parsing',
            useCases: 'Modern microservices ingress, API Gateways (Nginx, Envoy, Traefik, AWS ALB)',
        },
    };
}
