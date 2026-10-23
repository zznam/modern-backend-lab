// Browser-local learning rewards. No experiment payloads or personal data are stored.
class LearningJourney {
  constructor({ topics, paths, stored, completed, onChange, onTopic, onPath }) {
    this.topics = topics;
    this.paths = paths;
    this.completed = completed;
    this.onChange = onChange;
    this.filter = 'all';
    this.challenges = [
      { id: 'incident', title: 'Weather the traffic spike', description: 'Control incoming traffic, isolate a failing dependency, then spread out retries.', topics: ['rate-limiting', 'circuit-breaker', 'retry-backoff'], xp: 120 },
      { id: 'integrity', title: 'Protect the order', description: 'Keep a transaction atomic, publish its event reliably, and recover a failed workflow.', topics: ['acid-transactions', 'outbox-pattern', 'saga-pattern'], xp: 120 },
      { id: 'defender', title: 'Guard the API', description: 'Rotate credentials, enforce contextual permissions, and investigate common attacks.', topics: ['auth-jwt-rotation', 'abac-authorization', 'owasp-lab'], xp: 120 },
    ];
    this.missions = [
      { id: 'explore', title: 'Widen your horizon', description: 'Run 5 different labs this week.', max: 5, xp: 60 },
      { id: 'habit', title: 'Make it a habit', description: 'Run a lab on 3 different days this week.', max: 3, xp: 80 },
      { id: 'range', title: 'Stretch your range', description: 'Run a foundation, intermediate, and advanced lab this week.', max: 3, xp: 100 },
    ];
    this.levels = { foundation: 'Foundations', intermediate: 'Applied engineering', advanced: 'Advanced systems' };
    this.state = this.normalize(stored);
    document.querySelector('.journey-jumps').addEventListener('click', event => {
      const button = event.target.closest('[data-journey-section]');
      const section = button && document.getElementById(button.dataset.journeySection);
      if (section) {
        section.focus({ preventScroll: true });
        const main = document.getElementById('main-content');
        // Desktop scrolls inside the workspace; mobile scrolls the document.
        if (getComputedStyle(main).overflowY === 'auto') {
          main.scrollTo({ top: main.scrollTop + section.getBoundingClientRect().top - main.getBoundingClientRect().top - 16 });
        } else section.scrollIntoView({ block: 'start' });
      }
    });
    document.getElementById('challenge-board').addEventListener('click', event => {
      const button = event.target.closest('[data-challenge]');
      if (!button) return;
      const challenge = this.challenges.find(item => item.id === button.dataset.challenge);
      if (!challenge) return;
      const progress = this.state.challenges[challenge.id];
      if (progress?.claimed) { onTopic(challenge.topics[0]); return; }
      if (progress?.steps.length === challenge.topics.length) { this.claimChallenge(challenge.id); return; }
      this.state.challenges[challenge.id] ||= { started: this.dateKey(), steps: [], claimed: false };
      this.state.activeChallenge = challenge.id;
      this.render();
      onChange();
      onTopic(challenge.topics.find(key => !this.state.challenges[challenge.id].steps.includes(key)));
    });
    document.getElementById('challenge-pause').addEventListener('click', () => {
      this.state.activeChallenge = null;
      this.render();
      document.getElementById('challenge-feedback').textContent = 'Challenge paused. Your completed steps are saved.';
      document.getElementById('challenge-feedback').focus({ preventScroll: true });
      onChange();
    });
    document.getElementById('review-interval').value = String(this.state.reviewInterval);
    document.getElementById('review-interval').addEventListener('change', event => {
      this.state.reviewInterval = [3, 7, 14].includes(Number(event.target.value)) ? Number(event.target.value) : 7;
      this.render();
      onChange();
    });
    document.getElementById('review-queue').addEventListener('click', event => {
      const button = event.target.closest('[data-review-topic]');
      if (button && Object.hasOwn(topics, button.dataset.reviewTopic)) onTopic(button.dataset.reviewTopic);
    });
    document.getElementById('journey-badges').addEventListener('click', event => {
      const button = event.target.closest('[data-pin-badge]');
      const badge = button && this.achievements().find(item => item.id === button.dataset.pinBadge);
      if (!badge || badge.value < badge.max) return;
      this.state.pinnedBadge = this.state.pinnedBadge === badge.id ? null : badge.id;
      this.render();
      document.getElementById('showcase-feedback').textContent = this.state.pinnedBadge ? `${badge.title} added to your showcase.` : 'Achievement removed from your showcase.';
      onChange();
    });
    document.getElementById('daily-goal').value = String(this.state.goal);
    document.getElementById('daily-goal').addEventListener('change', event => {
      this.state.goal = Number(event.target.value);
      this.render();
      onChange();
    });
    document.getElementById('daily-next').addEventListener('click', () => {
      const key = this.nextDailyTopic();
      if (key) onTopic(key);
    });
    document.getElementById('journey-quests').addEventListener('click', event => {
      const button = event.target.closest('[data-quest]');
      if (!button) return;
      const path = paths[button.dataset.quest];
      const key = path.topics.find(topic => !completed.has(topic)) || path.topics[0];
      onPath(button.dataset.quest, key);
    });
    document.getElementById('activity-range').value = String(this.state.range);
    document.getElementById('activity-range').addEventListener('change', event => {
      this.state.range = Number(event.target.value) === 28 ? 28 : 7;
      this.render();
      onChange();
    });
    document.getElementById('weekly-missions').addEventListener('click', event => {
      const button = event.target.closest('[data-mission]');
      if (!button) return;
      const mission = this.weeklyMissions().find(item => item.id === button.dataset.mission);
      if (!mission || mission.claimed) return;
      if (mission.value >= mission.max) this.claimMission(mission.id);
      else if (mission.next) onTopic(mission.next);
    });
    document.getElementById('skill-tracks').addEventListener('click', event => {
      const button = event.target.closest('[data-skill-topic]');
      if (button && Object.hasOwn(topics, button.dataset.skillTopic)) onTopic(button.dataset.skillTopic);
    });
    document.getElementById('badge-filters').addEventListener('click', event => {
      const button = event.target.closest('[data-badge-filter]');
      if (!button) return;
      this.filter = button.dataset.badgeFilter;
      this.render();
    });
  }

  dateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  dayBefore(key, count = 1) {
    const [year, month, day] = key.split('-').map(Number);
    // Calendar arithmetic, rather than 24-hour durations, handles daylight-saving days.
    return this.dateKey(new Date(year, month - 1, day - count, 12));
  }

  normalize(stored) {
    const data = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    const known = values => Array.isArray(values) ? [...new Set(values.filter(key => typeof key === 'string' && Object.hasOwn(this.topics, key)))] : [];
    const days = {};
    const today = this.dateKey();
    if (data.days && typeof data.days === 'object' && !Array.isArray(data.days)) {
      for (const [day, topics] of Object.entries(data.days)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today || day < '2000-01-01') continue;
        if (this.dayBefore(day, 0) !== day) continue;
        const valid = known(topics);
        if (valid.length) days[day] = valid;
      }
    }
    const claims = {};
    if (data.claims && typeof data.claims === 'object' && !Array.isArray(data.claims)) {
      for (const [week, ids] of Object.entries(data.claims)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || week < '2000-01-01' || week > today
          || this.dayBefore(week, 0) !== week || this.weekStart(week) !== week || !Array.isArray(ids)) continue;
        // Reward totals are derived from unique, evidenced claims, never a stored XP balance.
        const progress = this.weekProgress(week, days);
        const valid = this.missions.filter(mission => ids.includes(mission.id) && progress[mission.id] >= mission.max).map(mission => mission.id);
        if (valid.length) claims[week] = valid;
      }
    }
    const challenges = {};
    for (const challenge of this.challenges) {
      const saved = data.challenges?.[challenge.id];
      if (!saved || typeof saved.started !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(saved.started)
        || saved.started < '2000-01-01' || saved.started > today || this.dayBefore(saved.started, 0) !== saved.started) continue;
      const evidenced = new Set(Object.entries(days).filter(([day]) => day >= saved.started).flatMap(([, keys]) => keys));
      const steps = known(saved.steps).filter(key => challenge.topics.includes(key) && evidenced.has(key));
      challenges[challenge.id] = { started: saved.started, steps, claimed: saved.claimed === true && steps.length === challenge.topics.length };
    }
    const active = this.challenges.find(item => item.id === data.activeChallenge);
    return { goal: [1, 3, 5].includes(data.goal) ? data.goal : 3, runs: known(data.runs), days,
      range: data.range === 28 ? 28 : 7, claims, challenges,
      activeChallenge: active && challenges[active.id] && !challenges[active.id].claimed ? active.id : null,
      reviewInterval: [3, 7, 14].includes(data.reviewInterval) ? data.reviewInterval : 7,
      pinnedBadge: ['discovery', 'start', 'explorer', 'momentum', 'pathfinder', 'practice', 'mission', 'range', 'specialist', 'champion'].includes(data.pinnedBadge) ? data.pinnedBadge : null };
  }

  recordRun(key) {
    if (!Object.hasOwn(this.topics, key)) return;
    const today = this.dateKey();
    if (!this.state.runs.includes(key)) this.state.runs.push(key);
    const daily = this.state.days[today] ||= [];
    if (!daily.includes(key)) daily.push(key);
    const challenge = this.challenges.find(item => item.id === this.state.activeChallenge);
    if (challenge?.topics.includes(key)) {
      const progress = this.state.challenges[challenge.id];
      if (!progress.claimed && !progress.steps.includes(key)) progress.steps.push(key);
    }
    this.quest?.recordRun(key);
    this.render();
    this.onChange();
  }

  streak(today = this.dateKey()) {
    // Yesterday's streak remains available until the learner has had today to return.
    let day = this.state.days[today]?.length ? today : this.dayBefore(today);
    let count = 0;
    while (this.state.days[day]?.length) {
      count++;
      day = this.dayBefore(day);
    }
    return count;
  }

  nextDailyTopic() {
    const today = this.state.days[this.dateKey()] || [];
    const keys = Object.keys(this.topics).filter(key => !today.includes(key));
    return keys.find(key => !this.completed.has(key)) || keys[0];
  }

  weekStart(day = this.dateKey()) {
    const weekday = new Date(`${day}T12:00:00`).getDay();
    return this.dayBefore(day, (weekday + 6) % 7);
  }

  weekProgress(week, days = this.state.days) {
    const entries = Object.entries(days).filter(([day]) => day >= week && day < this.dayBefore(week, -7));
    const topics = [...new Set(entries.flatMap(([, keys]) => keys))];
    return { explore: topics.length, habit: entries.length,
      range: new Set(topics.map(key => this.topics[key].level)).size, topics };
  }

  weeklyMissions() {
    const week = this.weekStart();
    const progress = this.weekProgress(week);
    const levels = new Set(progress.topics.map(key => this.topics[key].level));
    return this.missions.map(mission => ({ ...mission, value: progress[mission.id],
      claimed: (this.state.claims[week] || []).includes(mission.id),
      next: mission.id === 'habit' ? this.nextDailyTopic() : Object.keys(this.topics).find(key =>
        mission.id === 'range' ? !levels.has(this.topics[key].level) : !progress.topics.includes(key)),
    }));
  }

  claimMission(id) {
    // Re-check the current local week at click time, including after midnight.
    const mission = this.weeklyMissions().find(item => item.id === id);
    if (!mission || mission.claimed || mission.value < mission.max) return;
    (this.state.claims[this.weekStart()] ||= []).push(id);
    this.render();
    document.getElementById('mission-feedback').textContent = `${mission.title}: +${mission.xp} XP claimed!`;
    this.onChange();
  }

  bonusXP() {
    return Object.values(this.state.claims).reduce((total, ids) => total +
      this.missions.filter(mission => ids.includes(mission.id)).reduce((sum, mission) => sum + mission.xp, 0), 0)
      + this.challenges.reduce((total, challenge) => total + (this.state.challenges[challenge.id]?.claimed ? challenge.xp : 0), 0);
  }

  claimChallenge(id) {
    const challenge = this.challenges.find(item => item.id === id);
    const progress = challenge && this.state.challenges[id];
    if (!progress || progress.claimed || !challenge.topics.every(key => progress.steps.includes(key))) return;
    progress.claimed = true;
    if (this.state.activeChallenge === id) this.state.activeChallenge = null;
    this.render();
    document.getElementById('challenge-feedback').textContent = `${challenge.title}: +${challenge.xp} XP claimed! You can revisit the labs anytime.`;
    document.getElementById('challenge-feedback').focus({ preventScroll: true });
    this.onChange();
  }

  reviewQueue() {
    const lastRun = new Map();
    for (const day of Object.keys(this.state.days).sort()) {
      for (const key of this.state.days[day]) lastRun.set(key, day);
    }
    const cutoff = this.dayBefore(this.dateKey(), this.state.reviewInterval);
    return [...lastRun].filter(([, day]) => day <= cutoff)
      .sort(([a, dayA], [b, dayB]) => dayA.localeCompare(dayB) || a.localeCompare(b))
      .map(([key, day]) => ({ key, day }));
  }

  personalRecords() {
    let best = 0, streak = 0, previous;
    const days = Object.keys(this.state.days).sort();
    for (const day of days) {
      streak = previous === this.dayBefore(day) ? streak + 1 : 1;
      best = Math.max(best, streak);
      previous = day;
    }
    return { best, active: days.length, busiest: days.reduce((max, day) => Math.max(max, this.state.days[day].length), 0) };
  }

  achievements() {
    const completed = this.completed.size;
    const runs = this.state.runs.length;
    const paths = Object.values(this.paths).filter(path => path.topics.every(key => this.completed.has(key))).length;
    return [
      { icon: '↗', id: 'discovery', title: 'First discovery', description: 'Run your first lab successfully.', value: runs, max: 1 },
      { icon: '✓', id: 'start', title: 'A solid start', description: 'Mark your first lab complete.', value: completed, max: 1 },
      { icon: '◈', id: 'explorer', title: 'Curious explorer', description: 'Run 5 different labs successfully.', value: runs, max: 5 },
      { icon: '◇', id: 'momentum', title: 'Building momentum', description: 'Complete 10 labs.', value: completed, max: 10 },
      { icon: '⚑', id: 'pathfinder', title: 'Pathfinder', description: 'Complete every lab in a guided path.', value: paths, max: 1 },
      { icon: '↻', id: 'practice', title: 'Steady practice', description: 'Build a streak of 3 active days.', value: this.personalRecords().best, max: 3 },
      { icon: '✦', id: 'mission', title: 'Mission accomplished', description: 'Claim your first weekly mission reward.', value: Object.values(this.state.claims).flat().length, max: 1 },
      { icon: '△', id: 'range', title: 'Range finder', description: 'Successfully run a lab at all 3 difficulty levels.', value: new Set(this.state.runs.map(key => this.topics[key].level)).size, max: 3 },
      { icon: '⬡', id: 'specialist', title: 'Systems specialist', description: 'Mark 5 advanced labs complete.', value: [...this.completed].filter(key => this.topics[key].level === 'advanced').length, max: 5 },
      { icon: '◎', id: 'champion', title: 'Curriculum champion', description: 'Complete every lab in the curriculum.', value: completed, max: Object.keys(this.topics).length },
    ];
  }

  renderExtras({ text, html, escape }) {
    const active = this.challenges.find(item => item.id === this.state.activeChallenge);
    text('challenge-active', active ? `Active: ${active.title}` : 'Choose one challenge at a time');
    document.getElementById('challenge-pause').hidden = !active;
    const tracker = document.getElementById('challenge-tracker');
    tracker.hidden = !active;
    if (active) {
      const done = this.state.challenges[active.id].steps.length;
      const next = active.topics.find(key => !this.state.challenges[active.id].steps.includes(key));
      text('challenge-tracker-text', `${active.title} · ${done} / ${active.topics.length} labs run${next ? ` · Next: ${this.topics[next].title}` : ' · Reward ready to claim'}`);
    }
    html('challenge-board', this.challenges.map(challenge => {
      const progress = this.state.challenges[challenge.id];
      const done = progress?.steps || [];
      const ready = done.length === challenge.topics.length;
      const selected = active?.id === challenge.id;
      const action = progress?.claimed ? 'Revisit challenge →' : ready ? `Claim +${challenge.xp} XP` : selected ? 'Continue challenge →' : progress ? 'Resume challenge →' : 'Accept challenge →';
      return `<article class="journey-card challenge-card ${selected ? 'selected' : ''}">
        <div class="mission-meta"><span class="eyebrow">${progress?.claimed ? 'Reward claimed' : ready ? 'Ready to claim' : selected ? 'Active challenge' : progress ? 'Paused' : 'Scenario challenge'}</span><span class="xp-reward">+${challenge.xp} XP once</span></div>
        <h4>${escape(challenge.title)}</h4><p>${escape(challenge.description)}</p>
        <ol class="challenge-steps">${challenge.topics.map(key => `<li class="${done.includes(key) ? 'done' : ''}"><span aria-hidden="true">${done.includes(key) ? '✓' : '○'}</span><span>${escape(this.topics[key].title)}<span class="sr-only">: ${done.includes(key) ? 'done' : 'not yet run'}</span></span></li>`).join('')}</ol>
        <progress value="${done.length}" max="${challenge.topics.length}" aria-label="${escape(challenge.title)} progress"></progress><p>${done.length} / ${challenge.topics.length} labs run</p>
        <button class="${ready && !progress?.claimed ? 'primary-btn' : 'secondary-btn'}" data-challenge="${challenge.id}" aria-label="${escape(challenge.title)}: ${escape(action)}">${action}</button></article>`;
    }).join(''));
    const queue = this.reviewQueue();
    text('review-count', `${queue.length} ${queue.length === 1 ? 'lab' : 'labs'} due`);
    text('review-summary', queue.length ? `Showing the ${Math.min(5, queue.length)} oldest of ${queue.length} labs due. A successful run schedules that lab again in ${this.state.reviewInterval} days.`
      : Object.keys(this.state.days).length ? 'All caught up. Your practiced labs will appear here when they are due.' : 'Run a lab to start your review queue. Earlier completions without a run date are not scheduled.');
    html('review-queue', queue.slice(0, 5).map(({ key, day }) => `<li><div><strong>${escape(this.topics[key].title)}</strong><span>Last practiced <time datetime="${day}">${day}</time></span></div><button class="secondary-btn" data-review-topic="${key}" aria-label="Review ${escape(this.topics[key].title)}">Review →</button></li>`).join(''));
    const badge = this.achievements().find(item => item.id === this.state.pinnedBadge && item.value >= item.max);
    text('showcase-icon', badge?.icon || '◇');
    text('showcase-title', badge?.title || 'Make this journey yours');
    text('showcase-description', badge ? badge.description : 'Earn an achievement below, then choose “Showcase badge” to feature it here.');
  }

  render() {
    // Backups can replace preferences after the controls were first initialized.
    document.getElementById('daily-goal').value = String(this.state.goal);
    document.getElementById('activity-range').value = String(this.state.range);
    document.getElementById('review-interval').value = String(this.state.reviewInterval);
    const focused = document.activeElement;
    const focusAttribute = ['data-quest', 'data-mission', 'data-skill-topic', 'data-challenge', 'data-review-topic', 'data-pin-badge'].find(name => focused?.hasAttribute(name));
    const focusValue = focusAttribute && focused.getAttribute(focusAttribute);
    const text = (id, value) => {
      const element = document.getElementById(id);
      if (element.textContent !== String(value)) element.textContent = String(value);
    };
    const html = (id, value) => { document.getElementById(id).innerHTML = value; };
    const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const xp = this.state.runs.length * 20 + this.completed.size * 50 + this.bonusXP() + (this.quest?.xp() || 0);
    const level = Math.floor(xp / 250) + 1;
    text('journey-xp', `${xp} XP`);
    text('journey-total-xp', xp);
    text('journey-completed', `${this.completed.size} / ${Object.keys(this.topics).length}`);
    text('journey-level', `Level ${level} · ${['Apprentice', 'Explorer', 'Builder', 'Systems thinker', 'Architect'][Math.min(4, Math.floor((level - 1) / 3))]}`);
    text('journey-level-note', `${250 - xp % 250} XP to level ${level + 1}`);
    document.getElementById('journey-level-progress').value = xp % 250;
    const today = this.dateKey();
    const daily = this.state.days[today]?.length || 0;
    const goal = this.state.goal;
    const streak = this.streak(today);
    text('journey-streak', streak);
    text('daily-description', `Successfully run ${goal} different ${goal === 1 ? 'lab' : 'labs'} today. Revisit a familiar topic or discover something new.`);
    text('daily-feedback', daily >= goal ? `Goal reached! ${daily} different ${daily === 1 ? 'lab' : 'labs'} explored today.` : `${daily} of ${goal} labs explored today`);
    const progress = document.getElementById('daily-progress');
    progress.max = goal;
    progress.value = Math.min(daily, goal);
    const next = this.nextDailyTopic();
    const nextButton = document.getElementById('daily-next');
    nextButton.disabled = !next;
    nextButton.textContent = next ? (daily >= goal ? 'Explore another lab →' : 'Continue today’s quest →') : 'All labs explored today';
    text('streak-description', daily ? 'You showed up today. Come back tomorrow to continue your streak.'
      : streak ? 'Your streak is still alive. Run a lab today to keep it going.' : 'A fresh start is one lab away. Run any lab to begin a streak.');
    const range = this.state.range;
    text('activity-title', `Your last ${range} days`);
    const records = this.personalRecords();
    text('record-streak', `${records.best} ${records.best === 1 ? 'day' : 'days'}`);
    text('record-days', records.active);
    text('record-labs', `${records.busiest} ${records.busiest === 1 ? 'lab' : 'labs'}`);
    html('journey-week', Array.from({ length: range }, (_, index) => {
      const day = this.dayBefore(today, range - 1 - index);
      const count = this.state.days[day]?.length || 0;
      const date = new Date(`${day}T12:00:00`);
      const label = date.toLocaleDateString(undefined, { weekday: 'short' });
      return `<li class="${count ? 'active' : ''}"${day === today ? ' aria-current="date"' : ''}><span>${escape(label)}</span><span class="activity-dot" aria-hidden="true">${count || '·'}</span><span class="sr-only">${day}: ${count} ${count === 1 ? 'lab' : 'labs'}</span><span aria-hidden="true">${day === today ? 'Today' : date.getDate()}</span></li>`;
    }).join(''));
    html('journey-quests', Object.entries(this.paths).map(([id, path], index) => {
      const done = path.topics.filter(key => this.completed.has(key)).length;
      const next = path.topics.find(key => !this.completed.has(key));
      return `<article class="journey-card quest-card"><span class="eyebrow">Quest 0${index + 1}${next ? '' : ' · Completed'}</span><h4>${escape(path.label)}</h4><p>${done} / ${path.topics.length} labs complete</p><progress value="${done}" max="${path.topics.length}" aria-label="${escape(path.label)} completion"></progress><p class="quest-next">${next ? `Up next: ${escape(this.topics[next].title)}` : 'All steps complete. Revisit the path whenever you like.'}</p><button class="secondary-btn" data-quest="${id}">${next ? done ? 'Continue quest →' : 'Start quest →' : 'Revisit path →'}</button></article>`;
    }).join(''));
    const week = this.weekStart(today);
    const dateLabel = day => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    text('weekly-dates', `${dateLabel(week)} – ${dateLabel(this.dayBefore(week, -6))} · Resets Monday`);
    html('weekly-missions', this.weeklyMissions().map(mission => {
      const ready = mission.value >= mission.max;
      const waiting = mission.id === 'habit' && !ready && daily > 0;
      const disabled = mission.claimed || waiting || (!ready && !mission.next);
      return `<article class="journey-card mission-card ${mission.claimed ? 'claimed' : ready ? 'ready' : ''}">
        <div class="mission-meta"><span class="eyebrow">${mission.claimed ? 'Reward claimed' : ready ? 'Ready to claim' : 'Weekly mission'}</span><span class="xp-reward">+${mission.xp} XP</span></div>
        <h4>${escape(mission.title)}</h4><p>${escape(mission.description)}</p>
        <progress value="${Math.min(mission.value, mission.max)}" max="${mission.max}" aria-label="${escape(mission.title)} progress"></progress>
        <p class="mission-progress">${Math.min(mission.value, mission.max)} / ${mission.max}${waiting ? ' · Come back tomorrow' : ''}</p>
        <button class="${ready && !mission.claimed ? 'primary-btn' : 'secondary-btn'}" data-mission="${mission.id}" aria-label="${escape(mission.title)}: ${mission.claimed ? 'reward claimed' : ready ? `claim ${mission.xp} XP` : waiting ? 'return tomorrow' : 'explore a lab'}" ${disabled ? 'disabled' : ''}>${mission.claimed ? '✓ Claimed' : ready ? `Claim +${mission.xp} XP` : waiting ? 'Return tomorrow' : 'Explore a lab →'}</button>
      </article>`;
    }).join(''));
    html('skill-tracks', Object.entries(this.levels).map(([level, label]) => {
      const keys = Object.keys(this.topics).filter(key => this.topics[key].level === level);
      const done = keys.filter(key => this.completed.has(key)).length;
      const explored = keys.filter(key => this.state.runs.includes(key)).length;
      const next = keys.find(key => !this.completed.has(key)) || keys[0];
      return `<article class="journey-card skill-card"><span class="eyebrow">${done === keys.length ? 'Track complete' : done ? 'In progress' : 'Ready to begin'}</span><h4>${escape(label)}</h4>
        <p>${done} / ${keys.length} labs complete · ${explored} explored</p><progress value="${done}" max="${keys.length}" aria-label="${escape(label)} completion"></progress>
        <p class="quest-next">${done === keys.length ? 'Keep your skills sharp with another visit.' : `Up next: ${escape(this.topics[next].title)}`}</p>
        <button class="secondary-btn" data-skill-topic="${next}" aria-label="${done === keys.length ? 'Revisit' : 'Continue'} ${escape(label)}">${done === keys.length ? 'Revisit track →' : 'Continue track →'}</button></article>`;
    }).join(''));
    const badges = this.achievements();
    text('badge-count', `${badges.filter(badge => badge.value >= badge.max).length} / ${badges.length}`);
    document.querySelectorAll('[data-badge-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.badgeFilter === this.filter)));
    const shown = badges.filter(badge => this.filter === 'all' || (badge.value >= badge.max) === (this.filter === 'earned'));
    document.getElementById('badge-empty').hidden = shown.length > 0;
    text('badge-empty', this.filter === 'locked' ? 'All achievements earned. Keep exploring and revisiting your labs.' : 'No achievements here yet. Try a lab to get started.');
    html('journey-badges', shown.map(badge => {
      const earned = badge.value >= badge.max;
      return `<article class="journey-badge ${earned ? 'earned' : ''}"><span class="badge-icon" aria-hidden="true">${badge.icon}</span><div><span class="badge-state">${earned ? 'Earned' : 'Locked'} · ${Math.min(badge.value, badge.max)} / ${badge.max}</span><h4>${badge.title}</h4><p>${badge.description}</p>${earned ? `<button class="secondary-btn badge-pin" data-pin-badge="${badge.id}" aria-pressed="${this.state.pinnedBadge === badge.id}" aria-label="Showcase ${badge.title}">${this.state.pinnedBadge === badge.id ? '✓ Showcased' : 'Showcase badge'}</button>` : ''}</div></article>`;
    }).join(''));
    this.renderExtras({ text, html, escape });
    this.onQuestRender?.();
    // Periodic renders preserve keyboard position; claiming moves focus to its live confirmation.
    if (focusAttribute) {
      const target = [...document.querySelectorAll(`[${focusAttribute}]`)].find(element => element.getAttribute(focusAttribute) === focusValue);
      if (target?.disabled) document.getElementById('mission-feedback').focus({ preventScroll: true });
      else if (target) target.focus({ preventScroll: true });
      else if (focusAttribute === 'data-review-topic') document.getElementById('review-title').focus({ preventScroll: true });
      else if (focusAttribute === 'data-pin-badge') document.getElementById('showcase-feedback').focus({ preventScroll: true });
    }
  }
}
