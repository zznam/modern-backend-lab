/**
 * Asynchronous Communication & Message Broker Lab (Kafka / RabbitMQ / BullMQ)
 * Demonstrates:
 * 1. Event-Driven Architecture & Worker Queues
 * 2. Message Acknowledgments (ACK / NACK)
 * 3. Retry Queues (delay scheduling is demonstrated separately)
 * 4. Dead Letter Queue (DLQ) for poisoned messages
 * 5. Consumer Idempotency (Deduplication Store)
 */
import crypto from 'node:crypto';

export interface BrokerMessage<T = any> {
  id: string;
  topic: string;
  payload: T;
  deduplicationKey: string;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  lastError?: string;
}

export interface ConsumerResult {
  action: 'ACK' | 'RETRY' | 'DEAD_LETTER' | 'SKIPPED_DUPLICATE';
  messageId: string;
  attempt: number;
  error?: string;
}

export type MessageHandler<T = any> = (msg: BrokerMessage<T>) => Promise<void>;

export class MessageBrokerSimulator {
  private topics = new Map<string, BrokerMessage[]>();
  private dlq: BrokerMessage[] = [];
  private processedDeduplicationKeys = new Set<string>();
  private processingTopics = new Set<string>();
  private handlers = new Map<string, MessageHandler>();

  public publish<T>(topic: string, payload: T, deduplicationKey?: string, maxAttempts = 3): BrokerMessage<T> {
    const message: BrokerMessage<T> = {
      id: `msg_${crypto.randomUUID()}`,
      topic,
      payload,
      deduplicationKey: deduplicationKey || `dedup_${crypto.randomUUID()}`,
      attempts: 0,
      maxAttempts,
      createdAt: Date.now(),
    };

    if (!this.topics.has(topic)) {
      this.topics.set(topic, []);
    }
    this.topics.get(topic)!.push(message);
    return message;
  }

  public subscribe(topic: string, handler: MessageHandler): void {
    this.handlers.set(topic, handler);
  }

  // Consumer Loop: Processes pending messages
  public async processNext(topic: string): Promise<ConsumerResult | null> {
    if (this.processingTopics.has(topic)) return null;
    const queue = this.topics.get(topic);
    if (!queue || queue.length === 0) return null;

    const handler = this.handlers.get(topic);

    if (!handler) {
      throw new Error(`No registered consumer for topic: ${topic}`);
    }

    const message = queue.shift()!;

    this.processingTopics.add(topic);
    try {
      const dedupKey = JSON.stringify([topic, message.deduplicationKey]);
      // 1. Consumer Idempotency Check:
      if (this.processedDeduplicationKeys.has(dedupKey)) {
        return {
          action: 'SKIPPED_DUPLICATE',
          messageId: message.id,
          attempt: message.attempts,
        };
      }

      message.attempts++;

      try {
        // Execute consumer business logic
        await handler(message);

        // Successfully processed: Record ACK and mark deduplication key
        this.processedDeduplicationKeys.add(dedupKey);
        return {
          action: 'ACK',
          messageId: message.id,
          attempt: message.attempts,
        };
      } catch (err: any) {
        message.lastError = err.message;

        // Check if attempts exceeded max
        if (message.attempts >= message.maxAttempts) {
          // Route to Dead Letter Queue (DLQ)
          this.dlq.push(message);
          return {
            action: 'DEAD_LETTER',
            messageId: message.id,
            attempt: message.attempts,
            error: `Moved to DLQ after ${message.attempts} failed attempts: ${err.message}`,
          };
        } else {
          // Re-queue for the caller to schedule; this simulator does not sleep for backoff.
          queue.push(message);
          return {
            action: 'RETRY',
            messageId: message.id,
            attempt: message.attempts,
            error: `NACK: Retrying attempt ${message.attempts + 1}/${message.maxAttempts}`,
          };
        }
      }
    } finally {
      this.processingTopics.delete(topic);
    }
  }

  public getDlqMessages(): BrokerMessage[] {
    return [...this.dlq];
  }

  public replayDlq(targetTopic: string): number {
    const count = this.dlq.length;
    while (this.dlq.length > 0) {
      const msg = this.dlq.shift()!;
      msg.topic = targetTopic;
      msg.attempts = 0; // Reset attempts for replay
      if (!this.topics.has(targetTopic)) {
        this.topics.set(targetTopic, []);
      }
      this.topics.get(targetTopic)!.push(msg);
    }
    return count;
  }
}
