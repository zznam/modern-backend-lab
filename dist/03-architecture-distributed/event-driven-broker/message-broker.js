/**
 * Asynchronous Communication & Message Broker Lab (Kafka / RabbitMQ / BullMQ)
 * Demonstrates:
 * 1. Event-Driven Architecture & Worker Queues
 * 2. Message Acknowledgments (ACK / NACK)
 * 3. Exponential Backoff Retries
 * 4. Dead Letter Queue (DLQ) for poisoned messages
 * 5. Consumer Idempotency (Deduplication Store)
 */
import crypto from 'node:crypto';
export class MessageBrokerSimulator {
    topics = new Map();
    dlq = [];
    processedDeduplicationKeys = new Set();
    handlers = new Map();
    publish(topic, payload, deduplicationKey, maxAttempts = 3) {
        const message = {
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
        this.topics.get(topic).push(message);
        return message;
    }
    subscribe(topic, handler) {
        this.handlers.set(topic, handler);
    }
    // Consumer Loop: Processes pending messages
    async processNext(topic) {
        const queue = this.topics.get(topic);
        if (!queue || queue.length === 0)
            return null;
        const message = queue.shift();
        const handler = this.handlers.get(topic);
        if (!handler) {
            throw new Error(`No registered consumer for topic: ${topic}`);
        }
        // 1. Consumer Idempotency Check:
        if (this.processedDeduplicationKeys.has(message.deduplicationKey)) {
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
            this.processedDeduplicationKeys.add(message.deduplicationKey);
            return {
                action: 'ACK',
                messageId: message.id,
                attempt: message.attempts,
            };
        }
        catch (err) {
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
            }
            else {
                // Re-queue with exponential backoff
                queue.push(message);
                return {
                    action: 'RETRY',
                    messageId: message.id,
                    attempt: message.attempts,
                    error: `NACK: Retrying attempt ${message.attempts + 1}/${message.maxAttempts}`,
                };
            }
        }
    }
    getDlqMessages() {
        return [...this.dlq];
    }
    replayDlq(targetTopic) {
        const count = this.dlq.length;
        while (this.dlq.length > 0) {
            const msg = this.dlq.shift();
            msg.attempts = 0; // Reset attempts for replay
            if (!this.topics.has(targetTopic)) {
                this.topics.set(targetTopic, []);
            }
            this.topics.get(targetTopic).push(msg);
        }
        return count;
    }
}
