/**
 * Retries with Exponential Backoff + Full Jitter (AWS Architecture Best Practice)
 * Eliminates synchronized retry storms (Thundering Herds) after an outage recovery.
 */

export class RetryStrategies {
  // 1. Exponential Backoff without Jitter (Dangerous under high scale)
  public static calculateExponentialBackoff(attempt: number, baseMs = 100, maxMs = 5000): number {
    return Math.min(maxMs, baseMs * Math.pow(2, attempt));
  }

  // 2. Full Jitter: Sleep = random(0, min(maxMs, baseMs * 2 ^ attempt))
  public static calculateFullJitter(attempt: number, baseMs = 100, maxMs = 5000): number {
    const ceiling = Math.min(maxMs, baseMs * Math.pow(2, attempt));
    return Math.floor(Math.random() * ceiling);
  }

  // 3. Equal Jitter: Half fixed + half random
  public static calculateEqualJitter(attempt: number, baseMs = 100, maxMs = 5000): number {
    const ceiling = Math.min(maxMs, baseMs * Math.pow(2, attempt));
    const half = ceiling / 2;
    return Math.floor(half + Math.random() * half);
  }

  // Live simulation comparing 50 clients retrying simultaneously
  public static simulate50ClientsRetrying(): {
    naiveTimestamps: number[];
    jitteredTimestamps: number[];
    explanation: string;
  } {
    const attempt = 3;
    const naiveTimestamps: number[] = [];
    const jitteredTimestamps: number[] = [];

    for (let i = 0; i < 50; i++) {
      naiveTimestamps.push(this.calculateExponentialBackoff(attempt, 100, 5000));
      jitteredTimestamps.push(this.calculateFullJitter(attempt, 100, 5000));
    }

    return {
      naiveTimestamps: naiveTimestamps.slice(0, 10),
      jitteredTimestamps: jitteredTimestamps.slice(0, 10),
      explanation:
        'Without Jitter, all 50 clients wake up at the EXACT same millisecond (800ms), hammering the recovering backend with a destructive pulse! With Full Jitter, retries are uniformly distributed across 0ms-800ms, smoothing out traffic.',
    };
  }
}
