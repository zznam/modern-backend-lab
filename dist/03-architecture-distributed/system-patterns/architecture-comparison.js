/**
 * System Architecture Patterns: Monolith vs Modular Monolith vs Microservices vs Serverless
 */
export function getArchitecturePatternsMatrix() {
    return [
        {
            pattern: 'Monolith',
            optimalTeamSize: '1 - 10 engineers',
            deploymentModel: 'Single deployment artifact (one binary / container)',
            dataConsistency: 'Strong ACID transactions across all business entities via single database',
            operationalComplexity: 'LOW',
            networkOverhead: 'Zero network hops (in-process function calls, shared memory)',
            pros: [
                'Fastest time-to-market for new startups',
                'Simple local debugging with single breakpoints',
                'Easy end-to-end testing and single CI/CD pipeline',
                'Zero network serialization overhead',
            ],
            cons: [
                'Risk of becoming an unmaintainable "Big Ball of Mud" if module boundaries blur',
                'Deploying a bug in one module takes down the entire application',
                'Scaling requires replicating the entire application even if only one route is hot',
            ],
            recommendationThreshold: 'Early stage startups, MVPs, and small engineering teams.',
        },
        {
            pattern: 'Modular Monolith',
            optimalTeamSize: '5 - 50 engineers',
            deploymentModel: 'Single deployment unit with strictly enforced module boundaries and private schemas',
            dataConsistency: 'ACID transactions within module; Events / Outbox between domain modules',
            operationalComplexity: 'MEDIUM',
            networkOverhead: 'Zero network hops (direct memory invocations through public module interfaces)',
            pros: [
                'SWEET SPOT for 90% of modern backends: Clean domain boundaries without distributed systems tax!',
                'No distributed tracing or RPC latency overhead',
                'Zero Kubernetes cluster or service mesh operational overhead required',
                'Can seamlessly split into microservices later if team scale demands it',
            ],
            cons: [
                'Requires architectural discipline and linter rules to prevent cross-module DB joins',
                'Shared runtime means memory leaks or CPU loops affect other modules in the process',
            ],
            recommendationThreshold: 'The recommended default starting point for almost all commercial backend systems.',
        },
        {
            pattern: 'Microservices',
            optimalTeamSize: '50 - 500+ engineers (Organized into autonomous two-pizza teams)',
            deploymentModel: 'Independent CI/CD pipelines and deployment units per service',
            dataConsistency: 'Eventual consistency (Sagas, Outbox pattern, CQRS, distributed transactions)',
            operationalComplexity: 'VERY HIGH',
            networkOverhead: 'High (Multiple HTTP/gRPC hops per request, JSON/Protobuf serialization, connection pools)',
            pros: [
                'Autonomous teams deploy independently multiple times a day without coordinating',
                'Independent scaling (e.g. scale video transcoding workers without scaling billing API)',
                'Polyglot technology choices per service domain',
            ],
            cons: [
                'Distributed systems tax: partial failures, cascading timeouts, network partitions',
                'Requires sophisticated observability stack (OpenTelemetry, Jaeger, Prometheus, Grafana)',
                'Difficult local development (requires Docker Compose or Telepresence)',
            ],
            recommendationThreshold: 'Only justified when organizational team coordination is the primary bottleneck.',
        },
        {
            pattern: 'Serverless (FaaS)',
            optimalTeamSize: 'Any (Event-driven background workloads)',
            deploymentModel: 'Ephemeral function instances spun up on demand by cloud provider (AWS Lambda, Cloud Run)',
            dataConsistency: 'Externalized database consistency (Aurora Serverless, DynamoDB)',
            operationalComplexity: 'HIGH',
            networkOverhead: 'Variable (Cold start delays 100ms - 2000ms, external connection pool exhaustion)',
            pros: [
                'Scale to zero: $0 infrastructure cost when idle',
                'Infinite automatic burst scaling',
                'Zero OS patching or VM management',
            ],
            cons: [
                'Cold start latency spikes (problematic for user-facing APIs)',
                'Database connection pool starvation if 1,000 Lambdas open simultaneous DB connections',
                'Vendor lock-in and high cost at steady, sustained high traffic',
            ],
            recommendationThreshold: 'Spiky workloads, scheduled cron jobs, asynchronous webhooks, image/file processing.',
        },
    ];
}
