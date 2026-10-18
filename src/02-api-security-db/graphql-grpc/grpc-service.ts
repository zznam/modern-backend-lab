/**
 * gRPC & Protocol Buffers (Protobuf) Lab
 * Demonstrates:
 * 1. Strongly typed `.proto` contracts
 * 2. Binary wire format vs Textual JSON benchmark (Payload size & serialization throughput)
 * 3. Four gRPC Communication Patterns: Unary, Server Streaming, Client Streaming, Bidirectional
 */

export const sampleProtoSchema = `syntax = "proto3";

package billing.v1;

service PaymentService {
  // 1. Unary RPC
  rpc ProcessPayment (PaymentRequest) returns (PaymentResponse);

  // 2. Server Streaming RPC (e.g. streaming audit logs or ticker prices)
  rpc StreamTransactions (TransactionFilter) returns (stream TransactionRecord);

  // 3. Client Streaming RPC (e.g. uploading batch metrics or audio chunks)
  rpc UploadTelemetry (stream TelemetryBatch) returns (UploadSummary);

  // 4. Bidirectional Streaming RPC (e.g. real-time interactive trading or chat)
  rpc InteractiveSession (stream ClientMessage) returns (stream ServerMessage);
}

message PaymentRequest {
  string transaction_id = 1;
  string customer_id = 2;
  double amount = 3;
  string currency = 4;
  int64 timestamp = 5;
}

message PaymentResponse {
  string status = 1; // "APPROVED", "DECLINED"
  string authorization_code = 2;
  int64 processed_at = 3;
}

message TransactionFilter {
  string account_id = 1;
  int64 since_timestamp = 2;
}

message TransactionRecord {
  string id = 1;
  double amount = 2;
  string description = 3;
}

message TelemetryBatch {
  string metric_name = 1;
  double value = 2;
}

message UploadSummary {
  int32 total_points_received = 1;
  string status = 2;
}

message ClientMessage {
  string event_type = 1;
  bytes payload = 2;
}

message ServerMessage {
  string event_type = 1;
  bytes payload = 2;
}
`;

// Compact binary Protobuf-like serializer simulation (Tag-Length-Value encoding)
export function encodeBinaryProtobuf(obj: { transactionId: string; customerId: string; amount: number; currency: string }): Buffer {
  const chunks: Buffer[] = [];

  // Field 1: transactionId (string, wire type 2)
  const idBuf = Buffer.from(obj.transactionId, 'utf8');
  chunks.push(Buffer.from([0x0a, idBuf.length])); // (1 << 3) | 2 = 10 (0x0a)
  chunks.push(idBuf);

  // Field 2: customerId (string, wire type 2)
  const custBuf = Buffer.from(obj.customerId, 'utf8');
  chunks.push(Buffer.from([0x12, custBuf.length])); // (2 << 3) | 2 = 18 (0x12)
  chunks.push(custBuf);

  // Field 3: amount (double, wire type 1)
  const amountBuf = Buffer.alloc(8);
  amountBuf.writeDoubleLE(obj.amount);
  chunks.push(Buffer.from([0x19])); // (3 << 3) | 1 = 25 (0x19)
  chunks.push(amountBuf);

  // Field 4: currency (string, wire type 2)
  const currBuf = Buffer.from(obj.currency, 'utf8');
  chunks.push(Buffer.from([0x22, currBuf.length])); // (4 << 3) | 2 = 34 (0x22)
  chunks.push(currBuf);

  return Buffer.concat(chunks);
}

export function compareProtobufVsJsonBenchmark(iterations = 20000): {
  payloadSize: { jsonBytes: number; protobufBytes: number; reductionPercent: number };
  throughput: { jsonMs: number; protobufMs: number; speedup: string };
  schema: string;
} {
  const sample = {
    transactionId: 'txn_9876543210abcdef',
    customerId: 'cust_alpha_bravo_charlie',
    amount: 1499.99,
    currency: 'USD',
  };

  // 1. Payload size
  const jsonString = JSON.stringify(sample);
  const jsonBytes = Buffer.byteLength(jsonString);

  const protoBuf = encodeBinaryProtobuf(sample);
  const protoBytes = protoBuf.byteLength;

  // 2. Serialization Speed
  const startJson = performance.now();
  for (let i = 0; i < iterations; i++) {
    const s = JSON.stringify(sample);
    JSON.parse(s);
  }
  const jsonMs = performance.now() - startJson;

  const startProto = performance.now();
  for (let i = 0; i < iterations; i++) {
    encodeBinaryProtobuf(sample);
  }
  const protoMs = performance.now() - startProto;

  return {
    payloadSize: {
      jsonBytes,
      protobufBytes: protoBytes,
      reductionPercent: Math.round(((jsonBytes - protoBytes) / jsonBytes) * 100),
    },
    throughput: {
      jsonMs: Math.round(jsonMs * 100) / 100,
      protobufMs: Math.round(protoMs * 100) / 100,
      speedup: `${Math.round((jsonMs / protoMs) * 10) / 10}x faster`,
    },
    schema: sampleProtoSchema,
  };
}
