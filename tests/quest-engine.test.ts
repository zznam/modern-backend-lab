import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const catalogSource = readFileSync(new URL('../public/quest-catalog.js', import.meta.url), 'utf8');
const engineSource = readFileSync(new URL('../public/quest-engine.js', import.meta.url), 'utf8');
const context: Record<string, any> = { TextEncoder };
runInNewContext(`${catalogSource}\n${engineSource}\nglobalThis.Engine = QuestEngine; globalThis.campaigns = QUEST_CAMPAIGNS; globalThis.quizzes = QUEST_QUIZZES; globalThis.shop = QUEST_SHOP;`, context);
const campaigns = context.campaigns as any[];
const quizzes = context.quizzes as any[];
const shop = context.shop as any[];
const topics: Record<string, { level: string }> = {};
for (const campaign of campaigns) for (const topic of campaign.topics) topics[topic] = { level: campaign.level };
const keys = Object.keys(topics);

function setup(stored: any = {}, initialJourney: any = {}, initialCompleted: string[] = []) {
  let clock = new Date(2026, 9, 23, 12);
  const journey: any = { state: { runs: [], days: {}, claims: {}, challenges: {}, ...initialJourney } };
  const completed = new Set(initialCompleted);
  const engine = new context.Engine({ topics, stored, journey, completed, now: () => clock });
  const run = (key: string) => {
    const day = engine.dateKey();
    if (!journey.state.runs.includes(key)) journey.state.runs.push(key);
    (journey.state.days[day] ||= []).push(key);
    engine.recordRun(key);
  };
  return { engine, journey, completed, run, setDate: (date: Date) => { clock = date; } };
}

describe('Local quest rewards and progression', () => {
  it('preserves existing XP behavior until an explicit quest action earns a reward', () => {
    const { engine, run } = setup();
    keys.slice(0, 12).forEach(run);
    expect(engine.xp()).toBe(0);
    expect(engine.coins()).toBe(0);
    expect(engine.claimMilestone('lab-explorer')).toBe(true);
    expect(engine.xp()).toBe(80);
    expect(engine.claimMilestone('lab-explorer')).toBe(false);
    expect(engine.xp()).toBe(80);
  });

  it('requires a successful same-day lab result before advancing any run-based quest', () => {
    const { engine, run } = setup();
    engine.enqueue(keys[0]);
    engine.startCampaign(campaigns[0].id);
    engine.startSprint(2);
    engine.startFeatured();
    expect(engine.recordRun(keys[0])).toBe(false);
    expect(engine.campaignProgress(campaigns[0].id).value).toBe(0);
    expect(engine.state.sprint.topics).toEqual([]);
    expect(engine.state.dailyRewards).toEqual([]);
    expect(engine.state.queue).toEqual([keys[0]]);
    run(keys[0]);
    expect(engine.state.queue).toEqual([]);
  });

  it('only advances a campaign while active, deduplicates steps and claims once', () => {
    const { engine, run } = setup();
    const campaign = campaigns[0];
    campaign.topics.forEach(run);
    engine.startCampaign(campaign.id);
    expect(engine.campaignProgress(campaign.id).value).toBe(0);
    run(campaign.topics[0]); run(campaign.topics[0]);
    engine.pauseCampaign();
    run(campaign.topics[1]);
    expect(engine.campaignProgress(campaign.id).value).toBe(1);
    expect(engine.claimCampaign(campaign.id)).toBe(false);
    engine.startCampaign(campaign.id);
    campaign.topics.forEach(run);
    expect(engine.claimCampaign(campaign.id)).toBe(true);
    expect(engine.xp()).toBe(campaign.xp);
    expect(engine.coins()).toBe(campaign.coins);
    expect(engine.claimCampaign(campaign.id)).toBe(false);
    expect(engine.startCampaign(campaign.id)).toBe(false);
  });

  it('does not reward ordinary featured runs and only rewards an armed daily feature once', () => {
    const { engine, run, setDate } = setup();
    run(engine.featuredTopic());
    expect(engine.xp()).toBe(0);
    engine.startFeatured(); run(engine.featuredTopic()); run(engine.featuredTopic());
    expect(engine.xp()).toBe(15);
    expect(engine.coins()).toBe(10);
    expect(engine.startFeatured()).toBe(false);
    setDate(new Date(2026, 9, 24, 12));
    run(engine.featuredTopic());
    expect(engine.xp()).toBe(15);
    engine.startFeatured(); run(engine.featuredTopic());
    expect(engine.xp()).toBe(30);
  });

  it('supports paused daily sprints with distinct topics and one reward per local date', () => {
    const { engine, run, setDate } = setup();
    expect(engine.startSprint(4)).toBe(false);
    expect(engine.startSprint(2)).toBe(true);
    expect(engine.startSprint(3)).toBe(false);
    run(keys[0]); run(keys[0]);
    engine.toggleSprint(); run(keys[1]);
    expect(engine.state.sprint.topics).toEqual([keys[0]]);
    engine.toggleSprint(); run(keys[1]);
    expect(engine.state.sprint.status).toBe('complete');
    expect(engine.xp()).toBe(30);
    expect(engine.startSprint(5)).toBe(false);
    expect(engine.cancelSprint()).toBe(false);
    setDate(new Date(2026, 9, 24, 12));
    expect(engine.startSprint(2)).toBe(true);
    run(keys[0]); run(keys[1]);
    expect(engine.xp()).toBe(60);
    expect(engine.state.sprintHistory).toHaveLength(2);
  });

  it('pauses unfinished sprints across midnight and bounds history without losing rewards', () => {
    const { engine, run, setDate } = setup();
    engine.startSprint(2); run(keys[0]);
    setDate(new Date(2026, 9, 24, 12));
    run(keys[1]);
    expect(engine.state.sprint.status).toBe('paused');
    expect(engine.toggleSprint()).toBe(false);
    for (let day = 24; day < 46; day++) {
      setDate(new Date(2026, 9, day, 12));
      engine.startSprint(2); run(keys[0]); run(keys[1]);
    }
    expect(engine.state.sprintHistory).toHaveLength(20);
    expect(Object.keys(engine.state.sprintRewards)).toHaveLength(22);
    expect(engine.xp()).toBe(22 * 30);
  });

  it('preserves earned quiz history through retries, wrong answers and reloads', () => {
    const { engine } = setup();
    const quiz = quizzes[0];
    expect(engine.answerQuiz(quiz.id, -1)).toBeNull();
    expect(engine.answerQuiz(quiz.id, quiz.answer)).toMatchObject({ correct: true, earned: true });
    expect(engine.answerQuiz(quiz.id, quiz.answer)).toBeNull();
    engine.retryQuiz(quiz.id);
    engine.answerQuiz(quiz.id, (quiz.answer + 1) % quiz.options.length);
    expect(engine.xp()).toBe(35);
    expect(engine.quizStats()).toMatchObject({ solved: 1, attempts: 2, accuracy: 50 });
    const restored = setup(engine.state).engine;
    expect(restored.xp()).toBe(35);
    restored.retryQuiz(quiz.id);
    expect(restored.answerQuiz(quiz.id, quiz.answer).earned).toBe(false);
    expect(restored.xp()).toBe(35);
    expect(restored.quizStats()).toMatchObject({ attempts: 3, accuracy: 67 });
  });

  it('derives quiz correctness and rejects impossible stored reward evidence', () => {
    const quiz = quizzes[0];
    const { engine } = setup({
      quizzes: { [quiz.id]: { answer: (quiz.answer + 1) % quiz.options.length, correct: true } },
      solvedQuizzes: [quiz.id], quizAttempts: { [quiz.id]: 1000 },
      quizSuccesses: { [quiz.id]: { answer: quiz.answer, day: '2099-01-01' } },
      dailyRewards: ['2026-10-23', '2026-02-30', '2099-01-01'],
      campaigns: { [campaigns[0].id]: { started: '2026-10-23', steps: campaigns[0].topics, claimed: true } },
      milestoneClaims: ['quiz-debut', 'lab-explorer'], purchases: shop.map(item => item.id), coins: 999999, xp: 999999,
    });
    expect(engine.xp()).toBe(0);
    expect(engine.coins()).toBe(0);
    expect(engine.state.quizzes[quiz.id].correct).toBe(false);
    expect(engine.state.quizAttempts[quiz.id]).toBe(100);
    expect(engine.state.milestoneClaims).toEqual([]);
    expect(engine.state.purchases).toEqual([]);
  });

  it('offers eight evidence-based milestones and protects their claims on reload', () => {
    const { engine } = setup();
    quizzes.slice(0, 3).forEach(quiz => engine.answerQuiz(quiz.id, quiz.answer));
    expect(engine.milestones()).toHaveLength(8);
    expect(engine.claimMilestone('quiz-trio')).toBe(true);
    expect(engine.claimMilestone('quiz-master')).toBe(false);
    expect(engine.setProfile('pinnedMilestone', 'quiz-trio')).toBe(true);
    expect(engine.setProfile('pinnedMilestone', 'quiz-master')).toBe(false);
    expect(setup(engine.state).engine.xp()).toBe(engine.xp());
  });

  it('uses real coin budgets, unique purchases and owned-only cosmetics', () => {
    const { engine } = setup();
    const item = shop[0];
    expect(engine.buy(item.id)).toBe(item.cost === 0);
    quizzes.forEach(quiz => engine.answerQuiz(quiz.id, quiz.answer));
    const before = engine.coins();
    expect(engine.buy(item.id)).toBe(true);
    expect(engine.coins()).toBe(before - item.cost);
    expect(engine.buy(item.id)).toBe(false);
    expect(engine.equip(item.id)).toBe(true);
    expect(engine.state[item.type]).toBe(item.value);
    expect(engine.equip(shop[1].id)).toBe(false);
    const restored = setup(engine.state).engine;
    expect(restored.coins()).toBe(engine.coins());
    expect(restored.state[item.type]).toBe(item.value);
    expect(restored.setProfile('theme', 'default')).toBe(true);
    expect(restored.setProfile('title', 'Learner')).toBe(true);
    expect(restored.state.theme).toBe('default');
    expect(restored.state.title).toBe('Learner');
    expect(restored.setProfile('title', 'Architect')).toBe(false);
  });
});

describe('Local quest tools, recommendations and portable progress', () => {
  it('validates profiles, notes, ratings and unique queue operations', () => {
    const { engine } = setup();
    expect(engine.setProfile('alias', 'A'.repeat(50))).toBe(true);
    expect(engine.state.alias).toHaveLength(32);
    expect(engine.setProfile('avatar', '<script>')).toBe(false);
    expect(engine.setProfile('weeklyTarget', '10')).toBe(true);
    expect(engine.setProfile('weeklyTarget', 100)).toBe(false);
    expect(engine.toggleFavorite('__proto__')).toBe(false);
    engine.toggleFavorite(keys[0]); engine.toggleFavorite(keys[0]);
    expect(engine.state.favorites).toEqual([]);
    expect(engine.enqueue(keys[0])).toBe(true);
    expect(engine.enqueue(keys[0])).toBe(false);
    engine.enqueue(keys[1]); engine.moveQueue(keys[1], -1);
    expect(engine.state.queue).toEqual([keys[1], keys[0]]);
    expect(engine.moveQueue(keys[1], -1)).toBe(false);
    engine.dequeue(keys[1]);
    expect(engine.state.queue).toEqual([keys[0]]);
    engine.saveNote(keys[0], 'A'.repeat(1200));
    expect(engine.state.notes[keys[0]]).toHaveLength(1000);
    engine.saveNote(keys[0], ' ');
    expect(engine.state.notes[keys[0]]).toBeUndefined();
    expect(engine.setConfidence(keys[0], 4)).toBe(false);
    expect(engine.setConfidence(keys[0], '1')).toBe(true);
  });

  it('recommends declared weak topics and unexplored topics, honoring preferences and queue', () => {
    const { engine, run } = setup();
    engine.setConfidence(keys[3], 1);
    engine.setConfidence(keys[2], 3);
    expect(engine.recommendedTopic('weakest')).toBe(keys[3]);
    keys.slice(0, -1).forEach(run);
    expect(engine.recommendedTopic('surprise')).toBe(keys.at(-1));
    engine.enqueue(keys[4]);
    expect(engine.recommendedTopic('queue')).toBe(keys[4]);
    engine.toggleFavorite(keys[5]);
    expect(engine.recommendedTopic('favorite')).toBe(keys[5]);
    engine.setProfile('specialty', 'advanced');
    expect(topics[engine.recommendedTopic()].level).toBe('advanced');
  });

  it('computes mastery from independently evidenced practice, completion and topic knowledge', () => {
    const { engine, completed, run } = setup();
    const quiz = quizzes[0];
    expect(engine.mastery(quiz.topic)).toBe(0);
    run(quiz.topic); expect(engine.mastery(quiz.topic)).toBe(1);
    completed.add(quiz.topic); expect(engine.mastery(quiz.topic)).toBe(2);
    engine.answerQuiz(quiz.id, quiz.answer); expect(engine.mastery(quiz.topic)).toBe(3);
    engine.retryQuiz(quiz.id); expect(engine.topicMastery(quiz.topic)).toBe(3);
    expect(engine.mastery('unknown')).toBe(0);
  });

  it('uses local dates, weekly distinct labs and navigable monthly summaries', () => {
    const { engine, run, setDate } = setup();
    setDate(new Date(2026, 9, 1, 0, 1)); run(keys[0]);
    setDate(new Date(2026, 9, 19, 23, 59)); run(keys[0]); run(keys[0]);
    setDate(new Date(2026, 9, 20, 0, 1)); run(keys[1]);
    expect(engine.dateKey()).toBe('2026-10-20');
    expect(engine.stats().weeklyCount).toBe(2);
    expect(engine.monthSummary()).toMatchObject({ month: '2026-10', activeDays: 3, runs: 3, uniqueTopics: 2 });
    expect(engine.monthSummary('2026-09').activeDays).toBe(0);
    expect(engine.monthSummary('bad').month).toBe('2026-10');
    expect(engine.featuredTopic()).toBe(engine.featuredTopic('2026-10-20'));
    expect(quizzes.some(quiz => quiz.id === engine.dailyQuiz().id)).toBe(true);
  });

  it('rejects future schemas, impossible dates and forged sprint completion state', () => {
    expect(setup({ version: 9, alias: 'Future', favorites: [keys[0]] }).engine.state.alias).toBe('');
    const { engine } = setup({ sprint: { started: '2026-10-23', target: 2, status: 'complete', topics: keys.slice(0, 3) }, sprintRewards: { '2026-02-30': { target: 2, topics: keys.slice(0, 2) } } });
    expect(engine.state.sprint.status).toBe('paused');
    expect(engine.state.sprint.topics).toEqual([]);
    expect(engine.xp()).toBe(0);
    expect(engine.validDay('2026-02-30')).toBe(false);
    expect(engine.validDay('2026-10-24')).toBe(false);
    const quiz = quizzes[0];
    const futureQuiz = setup({ quizzes: { [quiz.id]: { answer: quiz.answer, correct: true } }, quizSuccesses: { [quiz.id]: { answer: quiz.answer, day: '2099-01-01' } } }).engine;
    expect(setup(futureQuiz.state).engine.xp()).toBe(0);
  });

  it('merges imported progress without replacing current progress or earning twice', () => {
    const source = setup();
    source.engine.setProfile('alias', 'Alex'); source.engine.setProfile('avatar', 'rocket');
    source.engine.startCampaign(campaigns[0].id); campaigns[0].topics.forEach(source.run); source.engine.claimCampaign(campaigns[0].id);
    source.completed.add(keys[0]);
    source.engine.answerQuiz(quizzes[0].id, quizzes[0].answer);
    source.engine.claimMilestone('quiz-debut');
    source.journey.state.claims = { '2026-10-19': ['explore'] };
    source.journey.state.challenges = { incident: { started: '2026-10-19', steps: [keys[0]], claimed: false } };
    const target = setup();
    target.engine.answerQuiz(quizzes[1].id, quizzes[1].answer);
    target.completed.add(keys[1]);
    target.journey.state.claims = { '2026-10-19': ['habit'] };
    target.journey.state.challenges = { incident: { started: '2026-10-20', steps: [keys[1]], claimed: false } };
    expect(target.engine.importData(source.engine.exportData())).toEqual({ ok: true });
    expect(target.engine.state.alias).toBe('Alex');
    expect(target.engine.state.avatar).toBe('rocket');
    expect(target.completed).toEqual(new Set([keys[0], keys[1]]));
    expect(target.journey.state.claims['2026-10-19']).toEqual(['habit', 'explore']);
    expect(target.journey.state.challenges.incident.steps).toEqual([keys[1], keys[0]]);
    expect(target.engine.state.solvedQuizzes).toHaveLength(2);
    expect(target.engine.campaignProgress(campaigns[0].id).claimed).toBe(true);
    const xp = target.engine.xp();
    target.engine.importData(source.engine.exportData());
    expect(target.engine.xp()).toBe(xp);
    target.engine.setProfile('alias', 'Pat'); target.engine.importData(source.engine.exportData());
    expect(target.engine.state.alias).toBe('Pat');
  });

  it('does not mutate state on malformed, oversized or unsupported backup imports', () => {
    const { engine, journey } = setup();
    engine.toggleFavorite(keys[0]);
    const before = engine.exportData();
    expect(engine.importData('{bad').ok).toBe(false);
    expect(engine.importData(' '.repeat(200001)).ok).toBe(false);
    expect(engine.importData(JSON.stringify({ format: 'backend-lab-quests', version: 2, state: {} })).ok).toBe(false);
    expect(engine.importData(JSON.stringify({ format: 'backend-lab-quests', version: 1, state: [] })).ok).toBe(false);
    expect(engine.importData(JSON.stringify({ format: 'backend-lab-quests', version: 1, state: { version: 2 } })).ok).toBe(false);
    expect(engine.exportData()).toBe(before);
    expect(journey.state.runs).toEqual([]);
  });

  it('restores default journey preferences while preserving existing choices on merge', () => {
    const preferences = { goal: 5, range: 28, reviewInterval: 14, activeChallenge: 'incident', pinnedBadge: 'discovery' };
    const source = setup({}, preferences);
    const target = setup({}, { goal: 3, range: 7, reviewInterval: 7, activeChallenge: null, pinnedBadge: null });
    expect(target.engine.importData(source.engine.exportData()).ok).toBe(true);
    expect(target.journey.state).toMatchObject(preferences);

    const existing = { goal: 1, range: 28, reviewInterval: 3, activeChallenge: 'integrity', pinnedBadge: 'explorer' };
    const customized = setup({}, existing);
    expect(customized.engine.importData(source.engine.exportData()).ok).toBe(true);
    expect(customized.journey.state).toMatchObject(existing);
  });

  it('resets only quest progress and preserves existing journey, completion and notes outside quests', () => {
    const { engine, journey, completed, run } = setup();
    run(keys[0]); completed.add(keys[0]);
    journey.state.claims = { '2026-10-19': ['habit'] };
    engine.answerQuiz(quizzes[0].id, quizzes[0].answer);
    engine.reset();
    expect(engine.xp()).toBe(0);
    expect(engine.state.solvedQuizzes).toEqual([]);
    expect(journey.state.claims['2026-10-19']).toEqual(['habit']);
    expect(journey.state.runs).toEqual([keys[0]]);
    expect(completed.has(keys[0])).toBe(true);
  });
});
