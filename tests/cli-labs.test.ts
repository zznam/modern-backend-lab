import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLI_LAB_IDS, resolveLabChoice } from '../src/cli-labs.js';

describe('CLI lab names', () => {
  it('maps every name to a distinct menu entry 1–27 and a real dashboard lab', () => {
    const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
    const dashboard = new Set([...html.matchAll(/data-exp="([^"]+)"/g)].map(match => match[1]));
    const numbers = Object.values(CLI_LAB_IDS);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers.map(Number).sort((a, b) => a - b)).toEqual(Array.from({ length: 27 }, (_, i) => i + 1));
    for (const id of Object.keys(CLI_LAB_IDS)) expect(dashboard.has(id), id).toBe(true);
  });

  it('accepts numbers, names in any case, and rejects unknown input', () => {
    expect(resolveLabChoice('24')).toBe('24');
    expect(resolveLabChoice(' Merkle-Anti-Entropy ')).toBe('24');
    expect(resolveLabChoice('event-loop')).toBe('1');
    expect(resolveLabChoice('no-such-lab')).toBeNull();
    expect(resolveLabChoice('__proto__')).toBeNull();
    expect(resolveLabChoice('constructor')).toBeNull();
  });
});
