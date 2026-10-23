// Browser-local learning rewards. No experiment payloads or personal data are stored.
class LearningJourney {
  constructor({ topics, paths, stored, completed, onChange, onTopic, onPath }) {
    this.topics = topics;
    this.paths = paths;
    this.completed = completed;
    this.onChange = onChange;
    this.filter = 'all';
    this.missions = [
      { id: 'explore', title: 'Widen your horizon', description: 'Run 5 different labs this week.', max: 5, xp: 60 },
      { id: 'habit', title: 'Make it a habit', description: 'Run a lab on 3 different days this week.', max: 3, xp: 80 },
      { id: 'range', title: 'Stretch your range', description: 'Run a foundation, intermediate, and advanced lab this week.', max: 3, xp: 100 },
    ];
    this.levels = { foundation: 'Foundations', intermediate: 'Applied engineering', advanced: 'Advanced systems' };
    this.state = this.normalize(stored);
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
    return { goal: [1, 3, 5].includes(data.goal) ? data.goal : 3, runs: known(data.runs), days,
      range: data.range === 28 ? 28 : 7, claims };
  }

  recordRun(key) {
    if (!Object.hasOwn(this.topics, key)) return;
    const today = this.dateKey();
    if (!this.state.runs.includes(key)) this.state.runs.push(key);
    const daily = this.state.days[today] ||= [];
    if (!daily.includes(key)) daily.push(key);
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
      this.missions.filter(mission => ids.includes(mission.id)).reduce((sum, mission) => sum + mission.xp, 0), 0);
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
      { icon: '↗', title: 'First discovery', description: 'Run your first lab successfully.', value: runs, max: 1 },
      { icon: '✓', title: 'A solid start', description: 'Mark your first lab complete.', value: completed, max: 1 },
      { icon: '◈', title: 'Curious explorer', description: 'Run 5 different labs successfully.', value: runs, max: 5 },
      { icon: '◇', title: 'Building momentum', description: 'Complete 10 labs.', value: completed, max: 10 },
      { icon: '⚑', title: 'Pathfinder', description: 'Complete every lab in a guided path.', value: paths, max: 1 },
      { icon: '↻', title: 'Steady practice', description: 'Build a streak of 3 active days.', value: this.personalRecords().best, max: 3 },
      { icon: '✦', title: 'Mission accomplished', description: 'Claim your first weekly mission reward.', value: Object.values(this.state.claims).flat().length, max: 1 },
      { icon: '△', title: 'Range finder', description: 'Successfully run a lab at all 3 difficulty levels.', value: new Set(this.state.runs.map(key => this.topics[key].level)).size, max: 3 },
      { icon: '⬡', title: 'Systems specialist', description: 'Mark 5 advanced labs complete.', value: [...this.completed].filter(key => this.topics[key].level === 'advanced').length, max: 5 },
      { icon: '◎', title: 'Curriculum champion', description: 'Complete every lab in the curriculum.', value: completed, max: Object.keys(this.topics).length },
    ];
  }

  render() {
    const focused = document.activeElement;
    const focusAttribute = ['data-quest', 'data-mission', 'data-skill-topic'].find(name => focused?.hasAttribute(name));
    const focusValue = focusAttribute && focused.getAttribute(focusAttribute);
    const text = (id, value) => {
      const element = document.getElementById(id);
      if (element.textContent !== String(value)) element.textContent = String(value);
    };
    const html = (id, value) => { document.getElementById(id).innerHTML = value; };
    const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const xp = this.state.runs.length * 20 + this.completed.size * 50 + this.bonusXP();
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
      return `<article class="journey-badge ${earned ? 'earned' : ''}"><span class="badge-icon" aria-hidden="true">${badge.icon}</span><div><span class="badge-state">${earned ? 'Earned' : 'Locked'} · ${Math.min(badge.value, badge.max)} / ${badge.max}</span><h4>${badge.title}</h4><p>${badge.description}</p></div></article>`;
    }).join(''));
    // Periodic renders preserve keyboard position; claiming moves focus to its live confirmation.
    if (focusAttribute) {
      const target = [...document.querySelectorAll(`[${focusAttribute}]`)].find(element => element.getAttribute(focusAttribute) === focusValue);
      if (target?.disabled) document.getElementById('mission-feedback').focus({ preventScroll: true });
      else target?.focus({ preventScroll: true });
    }
  }
}
