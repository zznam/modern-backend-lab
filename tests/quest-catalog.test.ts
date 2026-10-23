import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { runConsensusLab } from '../src/05-advanced-systems/consensus.js';
import { runFencingLab } from '../src/05-advanced-systems/fencing.js';
import { runReplicationLab } from '../src/05-advanced-systems/replication-quorums.js';
import { runTwoPhaseCommitLab } from '../src/05-advanced-systems/two-phase-commit.js';

type Campaign = { id: string; title: string; description: string; level: string; topics: string[]; xp: number; coins: number };
type Quiz = { id: string; topic: string; question: string; options: string[]; answer: number; explanation: string };
type ShopItem = { id: string; label: string; type: string; cost: number; value: string };
// Evaluate only trusted static repository data; no DOM or network is available.
const source = ['curriculum.js', 'quest-catalog.js'].map(file => readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8')).join('\n');
const catalog = runInNewContext(`${source}\n({ topics: Object.keys({...TOPIC_GUIDES, ...ADVANCED_TOPICS}), campaigns: QUEST_CAMPAIGNS, quizzes: QUEST_QUIZZES, shop: QUEST_SHOP })`, {}) as {
  topics: string[]; campaigns: Campaign[]; quizzes: Quiz[]; shop: ShopItem[];
};

describe('Quest learning content contract', () => {
  it('offers distinct, navigable campaigns covering every current lab exactly once', () => {
    expect(catalog.campaigns).toHaveLength(12);
    expect(new Set(catalog.campaigns.map(campaign => campaign.id)).size).toBe(12);
    expect(new Set(catalog.campaigns.map(campaign => campaign.title)).size).toBe(12);
    const routed = catalog.campaigns.flatMap(campaign => campaign.topics);
    expect([...routed].sort()).toEqual([...catalog.topics].sort());
    for (const campaign of catalog.campaigns) {
      expect(campaign.topics.length).toBeGreaterThanOrEqual(3);
      expect(campaign.topics.length).toBeLessThanOrEqual(4);
      expect(new Set(campaign.topics).size).toBe(campaign.topics.length);
      expect(['foundation', 'intermediate', 'advanced']).toContain(campaign.level);
      expect(campaign.title.length).toBeGreaterThan(0);
      expect(campaign.description.length).toBeGreaterThan(40);
      expect(Number.isInteger(campaign.xp)).toBe(true);
      expect(campaign.xp).toBeGreaterThanOrEqual(80);
      expect(campaign.xp).toBeLessThanOrEqual(180);
      expect(Number.isInteger(campaign.coins)).toBe(true);
      expect(campaign.coins).toBeGreaterThanOrEqual(10);
      expect(campaign.coins).toBeLessThanOrEqual(30);
    }
  });

  it('gives every quiz a valid lab, one addressable answer, distinct choices, and an explanation', () => {
    expect(catalog.quizzes).toHaveLength(12);
    expect(new Set(catalog.quizzes.map(quiz => quiz.id)).size).toBe(12);
    expect(new Set(catalog.quizzes.map(quiz => quiz.topic)).size).toBe(12);
    for (const quiz of catalog.quizzes) {
      expect(catalog.topics).toContain(quiz.topic);
      expect(quiz.options).toHaveLength(4);
      expect(new Set(quiz.options).size).toBe(4);
      expect(quiz.options.every(option => typeof option === 'string' && option.trim().length > 0)).toBe(true);
      expect(Number.isInteger(quiz.answer)).toBe(true);
      expect(quiz.answer).toBeGreaterThanOrEqual(0);
      expect(quiz.answer).toBeLessThan(quiz.options.length);
      expect(quiz.question.length).toBeGreaterThan(25);
      expect(quiz.explanation.length).toBeGreaterThan(50);
    }
  });

  it('keeps cosmetics compatible with the supported themes and title inventory', () => {
    expect(catalog.shop).toHaveLength(7);
    expect(new Set(catalog.shop.map(item => item.id)).size).toBe(7);
    expect(catalog.shop.filter(item => item.type === 'theme').map(item => item.value).sort()).toEqual(['amber', 'cyan', 'violet']);
    expect(catalog.shop.filter(item => item.type === 'title')).toHaveLength(4);
    for (const item of catalog.shop) {
      expect(['theme', 'title']).toContain(item.type);
      expect(item.id.startsWith(`${item.type}-`)).toBe(true);
      expect(Number.isInteger(item.cost)).toBe(true);
      expect(item.cost).toBeGreaterThan(0);
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.value.length).toBeGreaterThan(0);
    }
  });

  it('keeps the numeric quorum answers aligned with the executable teaching models', () => {
    const majority = catalog.quizzes.find(quiz => quiz.id === 'quorum-majority')!;
    expect(majority.options[majority.answer]).toBe('Three');
    expect(runConsensusLab(5, 3)).toMatchObject({ quorum: 3, elected: true });
    expect(runConsensusLab(5, 2).elected).toBe(false);
    const overlap = catalog.quizzes.find(quiz => quiz.id === 'replica-overlap')!;
    const pairs = overlap.options.map(option => option.match(/R = (\d), W = (\d)/)!.slice(1).map(Number));
    expect(pairs.map(([read, write]) => runReplicationLab(read, write).quorumIntersectionGuaranteed))
      .toEqual(overlap.options.map((_, index) => index === overlap.answer));
  });

  it('preserves the failure and recovery conditions described by the fencing and commit questions', () => {
    const fencing = catalog.quizzes.find(quiz => quiz.id === 'fencing-enforcement')!;
    expect(fencing.options[fencing.answer]).toContain('protected resource');
    expect(runFencingLab(1500)).toMatchObject({ expired: true, staleWriteAccepted: false, fencedValue: 'worker-B:new' });
    const commit = catalog.quizzes.find(quiz => quiz.id === 'two-phase-recovery')!;
    expect(commit.options[commit.answer]).toContain('durable commit');
    const result = runTwoPhaseCommitLab(2, 0);
    expect(result.blocked!.durableDecision).toBe('commit');
    expect(result.finalDecision).toBe('commit');
    expect(result.recovered.participants.every(participant => participant.state === 'committed')).toBe(true);
  });
});
