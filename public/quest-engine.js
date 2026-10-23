// Local-only quest rules. Rewards are derived from unique, evidenced achievements.
class QuestEngine {
  constructor({ topics, stored, journey, completed, now = () => new Date() }) {
    this.topics = topics;
    this.journey = journey;
    this.completed = completed;
    this.now = now;
    this.campaigns = QUEST_CAMPAIGNS;
    this.quizzes = QUEST_QUIZZES;
    this.shop = QUEST_SHOP;
    this.state = this.normalize(stored);
  }

  dateKey(date = this.now()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  validDay(day) {
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < '2000-01-01' || day > this.dateKey()) return false;
    const [year, month, date] = day.split('-').map(Number);
    return this.dateKey(new Date(year, month - 1, date, 12)) === day;
  }

  object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  known(key) { return typeof key === 'string' && Object.hasOwn(this.topics, key); }
  knownList(values) { return Array.isArray(values) ? [...new Set(values.filter(key => this.known(key)))] : []; }
  days() { return this.object(this.journey?.state?.days); }
  evidenced(key, since, through = this.dateKey()) {
    return Object.entries(this.days()).some(([day, keys]) => this.validDay(day) && day >= since && day <= through && Array.isArray(keys) && keys.includes(key));
  }

  normalize(stored) {
    const candidate = this.object(stored);
    const data = candidate.version !== undefined && candidate.version !== 1 ? {} : candidate;
    const state = {
      version: 1, alias: typeof data.alias === 'string' ? data.alias.trim().slice(0, 32) : '',
      avatar: ['compass', 'rocket', 'bolt', 'leaf'].includes(data.avatar) ? data.avatar : 'compass',
      specialty: ['all', 'foundation', 'intermediate', 'advanced'].includes(data.specialty) ? data.specialty : 'all',
      theme: 'default', title: 'Learner', favorites: this.knownList(data.favorites), queue: this.knownList(data.queue),
      confidence: {}, notes: {}, quizzes: {}, quizAttempts: {}, quizCorrectAttempts: {}, quizSuccesses: {}, solvedQuizzes: [],
      campaigns: {}, activeCampaign: null, featuredDay: data.featuredDay === this.dateKey() ? data.featuredDay : null,
      dailyRewards: [], sprint: null, sprintHistory: [], sprintRewards: {},
      weeklyTarget: [3, 5, 10, 15].includes(data.weeklyTarget) ? data.weeklyTarget : 5,
      milestoneClaims: [], purchases: [], pinnedMilestone: null,
    };
    for (const key of Object.keys(this.topics)) {
      if ([1, 2, 3].includes(data.confidence?.[key])) state.confidence[key] = data.confidence[key];
      if (typeof data.notes?.[key] === 'string' && data.notes[key].trim()) state.notes[key] = data.notes[key].trim().slice(0, 1000);
    }
    for (const quiz of this.quizzes) {
      const saved = data.quizzes?.[quiz.id];
      if (Number.isInteger(saved?.answer) && saved.answer >= 0 && saved.answer < quiz.options.length) {
        state.quizzes[quiz.id] = { answer: saved.answer, correct: saved.answer === quiz.answer };
      }
      const success = data.quizSuccesses?.[quiz.id];
      if (success?.answer === quiz.answer && this.validDay(success.day)) {
        state.quizSuccesses[quiz.id] = { answer: quiz.answer, day: success.day };
      }
      // A current answer or a solved id alone never establishes a reward;
      // the dated success record also survives clearing an answer for a retry.
      const attempts = Number.isInteger(data.quizAttempts?.[quiz.id]) ? data.quizAttempts[quiz.id] : 0;
      if (attempts > 0 || state.quizzes[quiz.id] || state.quizSuccesses[quiz.id]) state.quizAttempts[quiz.id] = Math.max(state.quizzes[quiz.id] || state.quizSuccesses[quiz.id] ? 1 : 0, Math.min(100, Math.max(0, attempts)));
      const correctAttempts = Number.isInteger(data.quizCorrectAttempts?.[quiz.id]) ? data.quizCorrectAttempts[quiz.id] : 0;
      state.quizCorrectAttempts[quiz.id] = Math.min(state.quizAttempts[quiz.id] || 0, Math.max(state.quizSuccesses[quiz.id] ? 1 : 0, correctAttempts));
    }
    state.solvedQuizzes = Object.keys(state.quizSuccesses);
    for (const campaign of this.campaigns) {
      const saved = data.campaigns?.[campaign.id];
      if (!this.validDay(saved?.started)) continue;
      const steps = this.knownList(saved.steps).filter(key => campaign.topics.includes(key) && this.evidenced(key, saved.started));
      state.campaigns[campaign.id] = { started: saved.started, steps,
        claimed: saved.claimed === true && campaign.topics.every(key => steps.includes(key)) };
      if (data.activeCampaign === campaign.id && !state.campaigns[campaign.id].claimed) state.activeCampaign = campaign.id;
    }
    state.dailyRewards = [...new Set(Array.isArray(data.dailyRewards) ? data.dailyRewards.filter(day => this.validDay(day) && this.evidenced(this.featuredTopic(day), day, day)) : [])].sort();
    const normalizeSprint = value => {
      if (!value || !this.validDay(value.started) || ![2, 3, 5].includes(value.target)) return null;
      const topics = this.knownList(value.topics).filter(key => this.evidenced(key, value.started, value.started));
      const status = value.status === 'complete' && topics.length >= value.target ? 'complete' : value.status === 'active' ? 'active' : 'paused';
      return { id: `sprint:${value.started}`, started: value.started, target: value.target, status, topics: topics.slice(0, value.target) };
    };
    for (const [day, saved] of Object.entries(this.object(data.sprintRewards))) {
      if (!this.validDay(day) || !saved || ![2, 3, 5].includes(saved.target)) continue;
      const topics = this.knownList(saved.topics).filter(key => this.evidenced(key, day, day));
      if (topics.length >= saved.target) state.sprintRewards[day] = { target: saved.target, topics: topics.slice(0, saved.target) };
    }
    const history = Array.isArray(data.sprintHistory) ? data.sprintHistory : [];
    for (const value of history) {
      const sprint = normalizeSprint(value);
      if (sprint?.status === 'complete' && state.sprintRewards[sprint.started] && !state.sprintHistory.some(item => item.id === sprint.id)) state.sprintHistory.push(sprint);
    }
    state.sprintHistory = state.sprintHistory.sort((a, b) => a.started.localeCompare(b.started)).slice(-20);
    state.sprint = normalizeSprint(data.sprint);
    // Sprints are daily challenges: overnight work is paused and starts a new sprint today.
    if (state.sprint?.status === 'active' && state.sprint.started !== this.dateKey()) state.sprint.status = 'paused';
    if (state.sprint && state.sprintRewards[state.sprint.started]) state.sprint.status = 'complete';
    else if (state.sprint?.status === 'complete') state.sprint.status = 'paused';
    if (state.sprint && state.sprint.status !== 'complete' && state.sprint.topics.length >= state.sprint.target) state.sprint.topics = state.sprint.topics.slice(0, state.sprint.target - 1);
    const claims = Array.isArray(data.milestoneClaims) ? data.milestoneClaims : [];
    state.milestoneClaims = this.milestoneDefinitions(state).filter(item => claims.includes(item.id) && item.value >= item.max).map(item => item.id);
    // Replay unique purchases in order against earned coins; fabricated balances do nothing.
    let budget = this.earnedCoins(state);
    for (const id of Array.isArray(data.purchases) ? data.purchases : []) {
      const item = this.shop.find(entry => entry.id === id);
      if (item && !state.purchases.includes(id) && item.cost <= budget) { state.purchases.push(id); budget -= item.cost; }
    }
    for (const field of ['theme', 'title']) {
      const item = this.shop.find(entry => entry.type === field && entry.value === data[field] && state.purchases.includes(entry.id));
      if (item) state[field] = item.value;
    }
    if (state.milestoneClaims.includes(data.pinnedMilestone)) state.pinnedMilestone = data.pinnedMilestone;
    return state;
  }

  setProfile(field, value) {
    if (field === 'alias' && typeof value === 'string') this.state.alias = value.trim().slice(0, 32);
    else if (field === 'avatar' && ['compass', 'rocket', 'bolt', 'leaf'].includes(value)) this.state.avatar = value;
    else if (field === 'specialty' && ['all', 'foundation', 'intermediate', 'advanced'].includes(value)) this.state.specialty = value;
    else if (field === 'weeklyTarget' && [3, 5, 10, 15].includes(Number(value))) this.state.weeklyTarget = Number(value);
    else if (field === 'pinnedMilestone' && (value === null || this.state.milestoneClaims.includes(value))) this.state.pinnedMilestone = value;
    else if (field === 'theme' && value === 'default') this.state.theme = 'default';
    else if (field === 'title' && value === 'Learner') this.state.title = 'Learner';
    else return false;
    return true;
  }

  toggleFavorite(key) {
    if (!this.known(key)) return false;
    if (this.state.favorites.includes(key)) this.state.favorites = this.state.favorites.filter(item => item !== key);
    else this.state.favorites.push(key);
    return true;
  }

  enqueue(key) {
    if (!this.known(key) || this.state.queue.includes(key)) return false;
    this.state.queue.push(key); return true;
  }
  dequeue(key) {
    if (!this.state.queue.includes(key)) return false;
    this.state.queue = this.state.queue.filter(item => item !== key); return true;
  }
  moveQueue(key, delta) {
    const index = this.state.queue.indexOf(key);
    if (![-1, 1].includes(delta) || index < 0 || index + delta < 0 || index + delta >= this.state.queue.length) return false;
    [this.state.queue[index], this.state.queue[index + delta]] = [this.state.queue[index + delta], this.state.queue[index]];
    return true;
  }
  setConfidence(key, value) {
    if (!this.known(key) || ![1, 2, 3].includes(Number(value))) return false;
    this.state.confidence[key] = Number(value); return true;
  }
  saveNote(key, text) {
    if (!this.known(key) || typeof text !== 'string') return false;
    if (text.trim()) this.state.notes[key] = text.trim().slice(0, 1000);
    else delete this.state.notes[key];
    return true;
  }

  dayIndex(day = this.dateKey()) {
    const [year, month, date] = day.split('-').map(Number);
    return Math.floor(Date.UTC(year, month - 1, date) / 86400000);
  }
  featuredTopic(day = this.dateKey()) {
    const keys = Object.keys(this.topics);
    return keys[((this.dayIndex(day) % keys.length) + keys.length) % keys.length];
  }
  startFeatured() {
    if (this.state.dailyRewards.includes(this.dateKey())) return false;
    this.state.featuredDay = this.dateKey(); return true;
  }
  recommendedTopic(mode = 'specialty') {
    const keys = Object.keys(this.topics);
    if (mode === 'queue') return this.state.queue[0] || keys.find(key => !this.completed.has(key)) || keys[0];
    if (mode === 'favorite') return this.state.favorites.find(key => !this.completed.has(key)) || this.state.favorites[0] || keys[0];
    if (mode === 'weakest') {
      const rated = keys.filter(key => this.state.confidence[key]);
      return (rated.length ? rated : keys).sort((a, b) => (this.state.confidence[a] || 0) - (this.state.confidence[b] || 0) || this.mastery(a) - this.mastery(b))[0];
    }
    if (mode === 'surprise') {
      const unexplored = keys.filter(key => !this.knownList(this.journey?.state?.runs).includes(key));
      const pool = unexplored.length ? unexplored : keys;
      return pool[Math.floor(Math.random() * pool.length)];
    }
    const pool = keys.filter(key => this.state.specialty === 'all' || this.topics[key].level === this.state.specialty);
    return pool.find(key => !this.completed.has(key)) || pool[0] || keys[0];
  }

  startSprint(target) {
    target = Number(target);
    if (![2, 3, 5].includes(target) || this.state.sprintRewards[this.dateKey()]) return false;
    if (this.state.sprint?.started === this.dateKey() && this.state.sprint.status !== 'complete') return false;
    this.state.sprint = { id: `sprint:${this.dateKey()}`, target, started: this.dateKey(), status: 'active', topics: [] };
    return true;
  }
  toggleSprint() {
    const sprint = this.state.sprint;
    if (!sprint || sprint.status === 'complete' || sprint.started !== this.dateKey()) return false;
    sprint.status = sprint.status === 'active' ? 'paused' : 'active'; return true;
  }
  cancelSprint() {
    if (!this.state.sprint || this.state.sprint.status === 'complete') return false;
    this.state.sprint = null; return true;
  }
  startCampaign(id) {
    if (!this.campaigns.some(item => item.id === id) || this.state.campaigns[id]?.claimed) return false;
    this.state.campaigns[id] ||= { started: this.dateKey(), steps: [], claimed: false };
    this.state.activeCampaign = id; return true;
  }
  pauseCampaign() {
    if (!this.state.activeCampaign) return false;
    this.state.activeCampaign = null; return true;
  }
  campaignProgress(id) {
    const campaign = this.campaigns.find(item => item.id === id);
    if (!campaign) return null;
    const saved = this.state.campaigns[id];
    const steps = saved?.steps || [];
    return { ...campaign, steps: [...steps], value: steps.length, max: campaign.topics.length, started: saved?.started || null,
      claimed: !!saved?.claimed, active: this.state.activeCampaign === id, next: campaign.topics.find(key => !steps.includes(key)) || campaign.topics[0] };
  }
  claimCampaign(id) {
    const progress = this.campaignProgress(id);
    if (!progress || !progress.started || progress.claimed || progress.value < progress.max) return false;
    this.state.campaigns[id].claimed = true;
    if (this.state.activeCampaign === id) this.state.activeCampaign = null;
    return true;
  }

  answerQuiz(id, index) {
    const quiz = this.quizzes.find(item => item.id === id);
    if (!quiz || !Number.isInteger(index) || index < 0 || index >= quiz.options.length || this.state.quizzes[id]) return null;
    const correct = index === quiz.answer;
    const earned = correct && !this.state.solvedQuizzes.includes(id);
    this.state.quizzes[id] = { answer: index, correct };
    this.state.quizAttempts[id] = Math.min(100, (this.state.quizAttempts[id] || 0) + 1);
    if (correct) this.state.quizCorrectAttempts[id] = Math.min(this.state.quizAttempts[id], (this.state.quizCorrectAttempts[id] || 0) + 1);
    if (earned) {
      this.state.solvedQuizzes.push(id);
      this.state.quizSuccesses[id] = { answer: index, day: this.dateKey() };
    }
    return { correct, explanation: quiz.explanation, earned };
  }
  retryQuiz(id) {
    if (!this.state.quizzes[id]) return false;
    delete this.state.quizzes[id]; return true;
  }
  quizStats() {
    const attempts = Object.values(this.state.quizAttempts).reduce((sum, count) => sum + count, 0);
    const correctAttempts = Object.values(this.state.quizCorrectAttempts).reduce((sum, count) => sum + count, 0);
    return { answered: Object.keys(this.state.quizzes).length, solved: this.state.solvedQuizzes.length, total: this.quizzes.length,
      attempts, accuracy: attempts ? Math.round(correctAttempts / attempts * 100) : 0 };
  }
  dailyQuiz() { return this.quizzes[((this.dayIndex() % this.quizzes.length) + this.quizzes.length) % this.quizzes.length]; }

  recordRun(key) {
    if (!this.known(key) || !this.evidenced(key, this.dateKey(), this.dateKey())) return false;
    const campaign = this.campaigns.find(item => item.id === this.state.activeCampaign);
    if (campaign?.topics.includes(key)) {
      const saved = this.state.campaigns[campaign.id];
      if (!saved.claimed && !saved.steps.includes(key)) saved.steps.push(key);
    }
    const day = this.dateKey();
    if (this.state.featuredDay === day && key === this.featuredTopic(day) && !this.state.dailyRewards.includes(day)) this.state.dailyRewards.push(day);
    const sprint = this.state.sprint;
    if (sprint?.status === 'active' && sprint.started !== day) sprint.status = 'paused';
    if (sprint?.status === 'active' && !sprint.topics.includes(key)) {
      sprint.topics.push(key);
      if (sprint.topics.length >= sprint.target) {
        sprint.status = 'complete';
        this.state.sprintRewards[day] = { target: sprint.target, topics: [...sprint.topics] };
        this.state.sprintHistory.push({ ...sprint, topics: [...sprint.topics] });
        this.state.sprintHistory = this.state.sprintHistory.slice(-20);
      }
    }
    this.dequeue(key);
    return true;
  }

  milestoneDefinitions(state = this.state) {
    const campaigns = Object.values(state.campaigns).filter(item => item.claimed).length;
    return [
      { id: 'quiz-debut', title: 'Curious mind', description: 'Solve your first knowledge check.', value: state.solvedQuizzes.length, max: 1, xp: 20, coins: 10 },
      { id: 'quiz-trio', title: 'Connecting ideas', description: 'Solve 3 different knowledge checks.', value: state.solvedQuizzes.length, max: 3, xp: 50, coins: 20 },
      { id: 'quiz-master', title: 'Knowledge keeper', description: 'Solve every knowledge check.', value: state.solvedQuizzes.length, max: this.quizzes.length, xp: 120, coins: 50 },
      { id: 'campaign-debut', title: 'Campaign explorer', description: 'Complete and claim a campaign.', value: campaigns, max: 1, xp: 40, coins: 20 },
      { id: 'campaign-trio', title: 'Systems navigator', description: 'Complete and claim 3 campaigns.', value: campaigns, max: 3, xp: 100, coins: 40 },
      { id: 'sprint-debut', title: 'Focused learner', description: 'Finish a daily focus sprint.', value: Object.keys(state.sprintRewards).length, max: 1, xp: 40, coins: 20 },
      { id: 'daily-trio', title: 'Daily explorer', description: 'Play the featured lab on 3 different days.', value: state.dailyRewards.length, max: 3, xp: 60, coins: 30 },
      { id: 'lab-explorer', title: 'Hands-on explorer', description: 'Successfully run 10 different labs.', value: this.knownList(this.journey?.state?.runs).length, max: 10, xp: 80, coins: 30 },
    ];
  }
  milestones() { return this.milestoneDefinitions().map(item => ({ ...item, claimed: this.state.milestoneClaims.includes(item.id) })); }
  claimMilestone(id) {
    const milestone = this.milestones().find(item => item.id === id);
    if (!milestone || milestone.claimed || milestone.value < milestone.max) return false;
    this.state.milestoneClaims.push(id); return true;
  }

  xp() {
    return this.state.solvedQuizzes.length * 35 + this.state.dailyRewards.length * 15
      + this.campaigns.reduce((sum, item) => sum + (this.state.campaigns[item.id]?.claimed ? item.xp : 0), 0)
      + Object.values(this.state.sprintRewards).reduce((sum, sprint) => sum + sprint.target * 15, 0)
      + this.milestoneDefinitions().reduce((sum, item) => sum + (this.state.milestoneClaims.includes(item.id) ? item.xp : 0), 0);
  }
  earnedCoins(state = this.state) {
    return state.solvedQuizzes.length * 15 + state.dailyRewards.length * 10
      + this.campaigns.reduce((sum, item) => sum + (state.campaigns[item.id]?.claimed ? item.coins : 0), 0)
      + Object.values(state.sprintRewards).reduce((sum, sprint) => sum + sprint.target * 10, 0)
      + this.milestoneDefinitions(state).reduce((sum, item) => sum + (state.milestoneClaims.includes(item.id) ? item.coins : 0), 0);
  }
  coins() { return this.earnedCoins() - this.shop.reduce((sum, item) => sum + (this.state.purchases.includes(item.id) ? item.cost : 0), 0); }
  buy(id) {
    const item = this.shop.find(entry => entry.id === id);
    if (!item || this.state.purchases.includes(id) || this.coins() < item.cost) return false;
    this.state.purchases.push(id); return true;
  }
  equip(id) {
    const item = this.shop.find(entry => entry.id === id);
    if (!item || !this.state.purchases.includes(id) || !['theme', 'title'].includes(item.type)) return false;
    this.state[item.type] = item.value; return true;
  }
  mastery(key) {
    if (!this.known(key)) return 0;
    return Number(this.knownList(this.journey?.state?.runs).includes(key)) + Number(this.completed.has(key))
      + Number(this.quizzes.some(quiz => quiz.topic === key && this.state.solvedQuizzes.includes(quiz.id)));
  }
  topicMastery(key) { return this.mastery(key); }
  monthSummary(month = this.dateKey().slice(0, 7)) {
    if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < '2000-01' || month > this.dateKey().slice(0, 7)) month = this.dateKey().slice(0, 7);
    const days = Object.entries(this.days()).filter(([day]) => day.startsWith(month) && this.validDay(day))
      .sort(([a], [b]) => a.localeCompare(b)).map(([day, keys]) => ({ day, topics: this.knownList(keys), count: this.knownList(keys).length }));
    return { month, activeDays: days.filter(day => day.count > 0).length, runs: days.reduce((sum, day) => sum + day.count, 0),
      uniqueTopics: new Set(days.flatMap(day => day.topics)).size, days };
  }
  stats() {
    const today = this.now();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (today.getDay() + 6) % 7, 12);
    const week = this.dateKey(start);
    const weeklyCount = new Set(Object.entries(this.days()).filter(([day]) => this.validDay(day) && day >= week).flatMap(([, keys]) => this.knownList(keys))).size;
    return { xp: this.xp(), coins: this.coins(), earnedCoins: this.earnedCoins(), spentCoins: this.earnedCoins() - this.coins(),
      successfulRuns: this.knownList(this.journey?.state?.runs).length, completed: this.completed.size,
      favorites: this.state.favorites.length, queued: this.state.queue.length, notes: Object.keys(this.state.notes).length,
      quizzes: this.quizStats(), campaigns: Object.values(this.state.campaigns).filter(item => item.claimed).length,
      finishedSprints: Object.keys(this.state.sprintRewards).length, featuredDays: this.state.dailyRewards.length,
      weeklyCount, weeklyTarget: this.state.weeklyTarget, weeklyPercent: Math.min(100, Math.round(weeklyCount / this.state.weeklyTarget * 100)) };
  }

  exportData() {
    return JSON.stringify({ format: 'backend-lab-quests', version: 1, exportedAt: this.now().toISOString(), state: this.state,
      journey: this.journey.state, completed: [...this.completed] }, null, 2);
  }
  importData(payload) {
    if (typeof payload !== 'string' || new TextEncoder().encode(payload).length > 200000) return { ok: false, error: 'Choose a progress backup smaller than 200 KB.' };
    let data;
    try { data = JSON.parse(payload); } catch { return { ok: false, error: 'This file is not valid JSON.' }; }
    if (!data || data.format !== 'backend-lab-quests' || data.version !== 1 || !data.state || typeof data.state !== 'object' || Array.isArray(data.state)
      || (data.state.version !== undefined && data.state.version !== 1)) return { ok: false, error: 'This is not a supported quest progress backup.' };
    const currentJourney = this.journey.state;
    const incomingJourney = this.object(data.journey);
    const combinedDays = {};
    for (const source of [currentJourney.days, incomingJourney.days]) {
      for (const [day, keys] of Object.entries(this.object(source))) {
        if (this.validDay(day)) combinedDays[day] = this.knownList([...(combinedDays[day] || []), ...this.knownList(keys)]);
      }
    }
    const combinedJourney = { ...incomingJourney, ...currentJourney, days: combinedDays,
      runs: this.knownList([...this.knownList(currentJourney.runs), ...this.knownList(incomingJourney.runs)]) };
    for (const field of ['claims', 'challenges']) {
      combinedJourney[field] = { ...this.object(incomingJourney[field]), ...this.object(currentJourney[field]) };
    }
    for (const [week, ids] of Object.entries(this.object(incomingJourney.claims))) {
      combinedJourney.claims[week] = [...new Set([...(Array.isArray(combinedJourney.claims[week]) ? combinedJourney.claims[week] : []), ...(Array.isArray(ids) ? ids : [])])];
    }
    for (const [id, saved] of Object.entries(this.object(incomingJourney.challenges))) {
      const current = currentJourney.challenges?.[id];
      if (current && saved && typeof saved === 'object') combinedJourney.challenges[id] = { ...current, started: [current.started, saved.started].filter(day => this.validDay(day)).sort()[0],
        steps: this.knownList([...this.knownList(current.steps), ...this.knownList(saved.steps)]), claimed: current.claimed === true || saved.claimed === true };
    }
    this.journey.state = typeof this.journey.normalize === 'function' ? this.journey.normalize(combinedJourney) : combinedJourney;
    const incoming = this.normalize(data.state);
    const current = this.state;
    const merged = { ...incoming, ...current };
    const defaults = { alias: '', avatar: 'compass', specialty: 'all', theme: 'default', title: 'Learner', weeklyTarget: 5, pinnedMilestone: null };
    for (const [field, value] of Object.entries(defaults)) if (current[field] === value) merged[field] = incoming[field];
    for (const field of ['favorites', 'queue', 'solvedQuizzes', 'dailyRewards', 'milestoneClaims', 'purchases']) merged[field] = [...new Set([...current[field], ...incoming[field]])];
    for (const field of ['confidence', 'notes', 'quizzes', 'quizSuccesses', 'sprintRewards']) merged[field] = { ...incoming[field], ...current[field] };
    merged.quizAttempts = { ...incoming.quizAttempts, ...current.quizAttempts };
    for (const id of Object.keys(incoming.quizAttempts)) merged.quizAttempts[id] = Math.max(current.quizAttempts[id] || 0, incoming.quizAttempts[id]);
    merged.quizCorrectAttempts = { ...incoming.quizCorrectAttempts, ...current.quizCorrectAttempts };
    for (const id of Object.keys(incoming.quizCorrectAttempts)) merged.quizCorrectAttempts[id] = Math.max(current.quizCorrectAttempts[id] || 0, incoming.quizCorrectAttempts[id]);
    merged.campaigns = { ...incoming.campaigns, ...current.campaigns };
    for (const [id, saved] of Object.entries(incoming.campaigns)) {
      const existing = current.campaigns[id];
      if (existing) merged.campaigns[id] = { started: [existing.started, saved.started].sort()[0], steps: this.knownList([...existing.steps, ...saved.steps]), claimed: existing.claimed || saved.claimed };
    }
    merged.sprintHistory = [...current.sprintHistory, ...incoming.sprintHistory];
    merged.sprint = current.sprint || incoming.sprint;
    if (!current.activeCampaign) merged.activeCampaign = incoming.activeCampaign;
    for (const key of this.knownList(data.completed)) this.completed.add(key);
    this.state = this.normalize(merged);
    return { ok: true };
  }
  reset() { this.state = this.normalize({}); return true; }
}
