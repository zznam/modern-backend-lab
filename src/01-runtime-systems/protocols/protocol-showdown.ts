/**
 * Protocol Showdown: HTTP/1.1 vs HTTP/2 vs HTTP/3 vs WebSockets vs SSE vs gRPC
 */

export interface ProtocolSpec {
  protocol: string;
  transport: string;
  multiplexing: boolean;
  bidirectional: boolean;
  headerOverhead: string;
  headOfLineBlocking: string;
  serialization: string;
  primaryUseCases: string;
  pros: string[];
  cons: string[];
}

export function getProtocolsComparison(): ProtocolSpec[] {
  return [
    {
      protocol: 'HTTP/1.1',
      transport: 'TCP',
      multiplexing: false,
      bidirectional: false,
      headerOverhead: 'High (Repeated uncompressed ASCII headers per request)',
      headOfLineBlocking: 'High (HOL blocking on single connection; browsers open 6 TCP connections per domain)',
      serialization: 'Text (JSON / XML / HTML)',
      primaryUseCases: 'Simple REST APIs, legacy services, public web pages',
      pros: ['Universal compatibility', 'Simple text-based debugging with curl/Wireshark', 'Easy proxying'],
      cons: ['Connection churn / overhead', 'HOL blocking stalls subsequent requests on same socket'],
    },
    {
      protocol: 'HTTP/2',
      transport: 'TCP',
      multiplexing: true,
      bidirectional: false, // half-duplex per stream, though multiple streams in flight
      headerOverhead: 'Low (HPACK binary compression with static & dynamic tables)',
      headOfLineBlocking: 'Eliminated at HTTP layer; Still exists at TCP layer if a packet drops',
      serialization: 'Binary framing (DATA, HEADERS, SETTINGS frames)',
      primaryUseCases: 'Modern web applications, asset delivery, internal microservices (gRPC substrate)',
      pros: ['Single TCP connection multiplexes hundreds of concurrent requests', 'Header compression', 'Stream prioritization'],
      cons: ['Single packet drop on TCP connection stalls ALL concurrent multiplexed streams'],
    },
    {
      protocol: 'HTTP/3 (QUIC)',
      transport: 'UDP (QUIC with TLS 1.3 built into transport)',
      multiplexing: true,
      bidirectional: false,
      headerOverhead: 'Very Low (QPACK compression adapted for out-of-order delivery)',
      headOfLineBlocking: 'Completely Eliminated (Packet loss on one stream does NOT block other streams)',
      serialization: 'Binary framing',
      primaryUseCases: 'Mobile devices, unstable cellular networks, high-performance global CDN delivery',
      pros: ['0-RTT connection resumption', 'Connection migration (switching WiFi to LTE without dropping stream)', 'No TCP HOL blocking'],
      cons: ['High CPU utilization on edge servers', 'Some corporate firewalls block UDP/443'],
    },
    {
      protocol: 'WebSockets',
      transport: 'TCP (upgraded from HTTP/1.1 via 101 Switching Protocols)',
      multiplexing: false,
      bidirectional: true,
      headerOverhead: 'Minimal (2 to 10 bytes framing header per message)',
      headOfLineBlocking: 'Application-level dependent',
      serialization: 'Text (JSON) or Binary (ArrayBuffer / Protobuf)',
      primaryUseCases: 'Real-time collaborative editing, chat applications, gaming, financial trading ticker feeds',
      pros: ['True full-duplex bidirectional communication', 'Ultra-low overhead per message', 'Client or server can initiate messages at any instant'],
      cons: ['Difficult to scale horizontally without Redis pub/sub backplane', 'No native reconnection or multiplexing semantics'],
    },
    {
      protocol: 'Server-Sent Events (SSE)',
      transport: 'HTTP (text/event-stream)',
      multiplexing: true, // when over HTTP/2
      bidirectional: false, // Unidirectional Server -> Client
      headerOverhead: 'Zero after initial handshake',
      headOfLineBlocking: 'None over HTTP/2',
      serialization: 'UTF-8 text formatted with `data: ...\\n\\n`',
      primaryUseCases: 'LLM streaming tokens (ChatGPT style), live notifications, stock price updates, dashboard metric feeds',
      pros: ['Built into browser standard (EventSource API)', 'Automatic reconnection with Last-Event-ID', 'Pure HTTP, passes through firewalls and proxies cleanly'],
      cons: ['Client cannot send data back upstream over the same channel (must use separate POST requests)'],
    },
    {
      protocol: 'gRPC',
      transport: 'HTTP/2 (Binary Protocol Buffers over TLS)',
      multiplexing: true,
      bidirectional: true, // Supports Unary, Client-streaming, Server-streaming, and Bidirectional-streaming
      headerOverhead: 'Extremely Low (HPACK + Compact Protobuf wire format)',
      headOfLineBlocking: 'Eliminated at application layer',
      serialization: 'Protocol Buffers (Protobuf binary schema)',
      primaryUseCases: 'Internal high-speed service-to-service microservice communication, polyglot backend systems',
      pros: ['Strongly-typed contracts (.proto)', '10x faster serialization and 5x smaller payload than JSON', 'Native code generation for Go, TS, Java, Python, Rust'],
      cons: ['Not directly callable from standard browsers without gRPC-Web proxy', 'Binary payload requires protobuf schema to decode'],
    },
  ];
}
