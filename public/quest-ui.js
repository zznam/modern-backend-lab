/* The quest hub is a browser-local companion to the existing learning journey. */
class QuestHub {
  constructor({ engine, onChange, onTopic }) {
    this.engine = engine;
    this.onChange = onChange;
    this.onTopic = onTopic;
    this.root = document.getElementById('quest-hub');
    this.tab = 'overview';
    this.filters = { campaignSearch: '', campaignLevel: 'all', campaignStatus: 'all', campaignSort: 'recommended', quizMode: 'all', noteSearch: '', mastery: 'all' };
    this.selectedTopic = Object.keys(engine.topics)[0];
    this.selectedQuiz = engine.quizzes[0]?.id;
    this.aliasDraft = engine.state.alias;
    this.noteDrafts = {};
    this.answerDrafts = {};
    this.disclosureState = new Map();
    this.resetPending = false;
    this.month = this.localMonth();
    this.root.innerHTML = `<div class="qh-header"><div><span class="eyebrow">Make progress your own</span><h3 id="quest-hub-title" tabindex="-1">Quest hub</h3><p>Small challenges. Useful practice. A journey that belongs to you.</p></div><div class="qh-wallet" aria-label="Your quest coins"><span aria-hidden="true">✦</span> <strong data-qh-wallet>0</strong><span>coins</span></div></div>
      <div class="qh-tabs" role="tablist" aria-label="Quest hub sections">${[['overview', 'Overview'], ['campaigns', 'Campaigns'], ['knowledge', 'Knowledge'], ['practice', 'Practice'], ['profile', 'Profile'], ['progress', 'Progress']].map(([id, label]) => `<button type="button" role="tab" id="qh-tab-${id}" aria-controls="qh-panel" aria-selected="${id === this.tab}" tabindex="${id === this.tab ? 0 : -1}" data-qh-tab="${id}">${label}</button>`).join('')}</div>
      <p class="qh-status" role="status" aria-live="polite" aria-atomic="true"></p><div id="qh-panel" class="qh-panel" role="tabpanel" aria-labelledby="qh-tab-overview" tabindex="0"></div>`;
    this.root.addEventListener('click', event => this.handleClick(event));
    this.root.addEventListener('change', event => this.handleChange(event));
    this.root.addEventListener('input', event => this.handleInput(event));
    this.root.addEventListener('submit', event => this.handleSubmit(event));
    window.addEventListener('beforeunload', event => {
      if (!Object.keys(this.noteDrafts).some(topic => this.noteDirty(topic))) return;
      event.preventDefault();
      event.returnValue = '';
    });
    this.root.querySelector('.qh-tabs').addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = [...this.root.querySelectorAll('[data-qh-tab]')];
      const index = tabs.indexOf(event.target);
      if (index < 0) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      this.selectTab(tabs[next].dataset.qhTab);
      tabs[next].focus();
    });
    this.render();
  }

  escape(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
  localMonth() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
  title(key) { return this.engine.topics[key]?.title || key; }
  option(value, label, current) { return `<option value="${this.escape(value)}"${value === current ? ' selected' : ''}>${this.escape(label)}</option>`; }
  button(action, label, value = '', options = {}) {
    return `<button type="button" class="${options.primary ? 'primary-btn' : 'secondary-btn'}${options.className ? ` ${options.className}` : ''}" data-qh-action="${action}" data-value="${this.escape(value)}" data-qh-focus="${action}:${this.escape(value)}"${options.disabled ? ' disabled' : ''}${options.pressed !== undefined ? ` aria-pressed="${options.pressed}"` : ''}${options.aria ? ` aria-label="${this.escape(options.aria)}"` : ''}>${this.escape(label)}</button>`;
  }
  topicButton(key, label = 'Open lab →', options = {}) { return key ? this.button('topic', label, key, options) : '<p class="qh-muted">You have explored every available lab.</p>'; }
  progress(value, max, label) { return `<progress value="${Math.min(value, max)}" max="${max || 1}" aria-label="${this.escape(label)}"></progress>`; }
  empty(text) { return `<p class="qh-empty">${this.escape(text)}</p>`; }
  noteDirty(topic = this.selectedTopic) {
    return Object.hasOwn(this.noteDrafts, topic)
      && this.noteDrafts[topic].trim().slice(0, 1000) !== (this.engine.state.notes[topic] || '');
  }
  noteStatus(topic = this.selectedTopic) {
    const length = (this.noteDrafts[topic] ?? this.engine.state.notes[topic] ?? '').length;
    return `${this.noteDirty(topic) ? 'Unsaved changes' : this.engine.state.notes[topic] ? 'Reflection saved' : 'No saved reflection'} · ${length} / 1,000 characters`;
  }
  selectTab(tab) { this.tab = tab; this.resetPending = false; this.render(); }
  open(tab = 'overview', topic) {
    if (!['overview', 'campaigns', 'knowledge', 'practice', 'profile', 'progress'].includes(tab)) return;
    if (topic && this.engine.known(topic)) this.selectedTopic = topic;
    this.selectTab(tab);
  }
  announce(message) { this.root.querySelector('.qh-status').textContent = message; }
  changed(message) { this.render(); this.onChange(); if (message) this.announce(message); }
  mutate(method, args, success) {
    if (this.engine[method](...args)) this.changed(success);
    else this.announce('That action is not available yet. Your progress is unchanged.');
  }

  render() {
    if (!this.root) return;
    const focused = this.root.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = focused?.dataset.qhFocus;
    const selection = focused && ['INPUT', 'TEXTAREA'].includes(focused.tagName) && typeof focused.selectionStart === 'number' ? [focused.selectionStart, focused.selectionEnd] : null;
    const scrollTop = focused?.scrollTop;
    this.root.dataset.theme = this.engine.state.theme || 'cyan';
    this.root.querySelector('[data-qh-wallet]').textContent = this.engine.coins();
    this.root.querySelectorAll('[data-qh-tab]').forEach(button => {
      const selected = button.dataset.qhTab === this.tab;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    const panel = this.root.querySelector('#qh-panel');
    panel.querySelectorAll('details[data-qh-details]').forEach(details => {
      this.disclosureState.set(details.dataset.qhDetails, details.open);
    });
    panel.setAttribute('aria-labelledby', `qh-tab-${this.tab}`);
    const html = this[`${this.tab}View`]();
    if (panel.innerHTML !== html) panel.innerHTML = html;
    panel.querySelectorAll('details[data-qh-details]').forEach(details => {
      details.open = this.disclosureState.get(details.dataset.qhDetails) === true;
    });
    if (focusKey) {
      const replacement = [...this.root.querySelectorAll('[data-qh-focus]')].find(element => element.dataset.qhFocus === focusKey);
      if (replacement && !replacement.disabled) {
        replacement.focus({ preventScroll: true });
        if (selection) replacement.setSelectionRange?.(...selection);
        if (scrollTop) replacement.scrollTop = scrollTop;
      } else if (focused && panel.contains(focused) === false) panel.focus({ preventScroll: true });
    }
  }

  overviewView() {
    const { engine } = this;
    const state = engine.state;
    const stats = engine.stats();
    const featured = engine.featuredTopic();
    const recommended = engine.recommendedTopic();
    const weakest = engine.recommendedTopic('weakest');
    const avatar = { compass: '◈', rocket: '↗', bolt: 'ϟ', leaf: '❧' }[state.avatar] || '◈';
    const active = state.activeCampaign && engine.campaignProgress(state.activeCampaign);
    const pinned = engine.milestones().find(item => item.id === state.pinnedMilestone);
    const hasUnexplored = Object.keys(engine.topics).some(key => !engine.journey.state.runs.includes(key));
    const totalXP = this.totalXP();
    const level = Math.floor(totalXP / 250) + 1;
    const daily = state.dailyRewards.includes(engine.dateKey());
    return `<div class="qh-welcome"><div class="qh-avatar" aria-label="${this.escape(state.avatar)} avatar">${avatar}</div><div><span class="eyebrow">${this.escape(state.title || 'Your next chapter')}</span><h4>Hello, ${this.escape(state.alias || 'Explorer')}.</h4><p>Level ${level} · ${totalXP} total XP · ${stats.quizzes.solved} knowledge checks mastered</p></div></div>
      <div class="qh-grid"><article class="qh-card qh-featured"><span class="eyebrow">Today's fieldwork</span><h4>${this.escape(this.title(featured))}</h4><p>A fresh daily invitation. Start here and successfully run this lab to earn a once-per-day bonus.</p><div class="qh-reward">${daily ? '✓ Daily bonus earned' : '+15 XP · +10 coins'}</div>${this.button('featured', daily ? 'Revisit featured lab →' : 'Play daily featured →', '', { primary: !daily })}</article>
      <article class="qh-card"><span class="eyebrow">Chosen for your specialty</span><h4>${this.escape(this.title(recommended))}</h4><p>Keep moving through ${state.specialty === 'all' ? 'the whole curriculum' : `${this.escape(state.specialty)} labs`}, one useful idea at a time.</p>${this.topicButton(recommended, 'Try your recommendation →')}${this.button('surprise', 'Surprise me with an unexplored lab', '', { disabled: !hasUnexplored })}</article>
      <article class="qh-card"><span class="eyebrow">Build confidence</span><h4>${weakest ? this.escape(this.title(weakest)) : 'Find your next practice focus'}</h4><p>Low-confidence labs appear first. Add your confidence ratings in Practice to guide this recommendation.</p>${this.topicButton(weakest, 'Practice this topic →')}</article>
      <article class="qh-card"><span class="eyebrow">Pick up where you left off</span><h4>${active ? this.escape(active.title) : 'Make room for a small win'}</h4>${active ? `<p>${active.value} of ${active.max} campaign steps complete.</p>${this.progress(active.value, active.max, 'Active campaign progress')}${active.value < active.max ? this.topicButton(active.next, 'Continue campaign →') : this.button('claim-campaign', 'Claim campaign reward', active.id, { primary: true, disabled: active.claimed })}` : `<p>Accept a campaign for a guided challenge, or prepare a personal practice queue.</p>${this.button('tab', 'Browse campaigns →', 'campaigns')}`}${state.queue.length ? this.topicButton(engine.recommendedTopic('queue'), `Resume practice queue (${state.queue.length}) →`) : ''}</article></div>
      ${pinned ? `<article class="qh-pinned"><span aria-hidden="true">✧</span><div><span class="eyebrow">Your milestone showcase</span><h4>${this.escape(pinned.title)}</h4><p>${this.escape(pinned.description)} · Reward claimed</p></div>${this.button('tab', 'View milestones →', 'progress')}</article>` : ''}
      <div class="qh-inline-stats"><span><strong>${state.favorites.length}</strong> saved labs</span><span><strong>${stats.finishedSprints}</strong> focus sprints</span><span><strong>${stats.notes}</strong> reflections</span><span><strong>${stats.weeklyCount} / ${stats.weeklyTarget}</strong> weekly labs</span></div>
      <p class="qh-footnote">Everything here stays in this browser. Coins unlock cosmetics and have no monetary value. Take a break whenever you need one.</p>`;
  }

  campaignsView() {
    const { filters, engine } = this;
    let campaigns = engine.campaigns.map(campaign => engine.campaignProgress(campaign.id));
    const status = campaign => campaign.claimed ? 'claimed' : campaign.value >= campaign.max ? 'ready' : campaign.active ? 'active' : campaign.started ? 'paused' : 'new';
    campaigns = campaigns.filter(campaign => `${campaign.title} ${campaign.description}`.toLowerCase().includes(filters.campaignSearch.toLowerCase()) && (filters.campaignLevel === 'all' || campaign.level === filters.campaignLevel) && (filters.campaignStatus === 'all' || status(campaign) === filters.campaignStatus));
    if (filters.campaignSort === 'title') campaigns.sort((a, b) => a.title.localeCompare(b.title));
    if (filters.campaignSort === 'progress') campaigns.sort((a, b) => b.value / b.max - a.value / a.max);
    if (filters.campaignSort === 'reward') campaigns.sort((a, b) => b.xp - a.xp);
    if (filters.campaignSort === 'recommended') campaigns.sort((a, b) => Number(b.active) - Number(a.active) || Number(a.claimed) - Number(b.claimed));
    return `<div class="qh-section-intro"><h4>Choose your next expedition</h4><p>Successful runs after you accept a campaign fill its steps. Switching or pausing keeps your progress.</p></div>
      <div class="qh-filters"><label>Find a campaign<input type="search" data-qh-filter="campaignSearch" data-qh-focus="campaign-search" value="${this.escape(filters.campaignSearch)}" placeholder="Search challenges"></label><label>Difficulty<select data-qh-filter="campaignLevel" data-qh-focus="campaign-level">${[['all', 'All difficulties'], ['foundation', 'Foundation'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']].map(([value, label]) => this.option(value, label, filters.campaignLevel)).join('')}</select></label><label>Status<select data-qh-filter="campaignStatus" data-qh-focus="campaign-status">${[['all', 'All statuses'], ['new', 'Not started'], ['active', 'Active'], ['paused', 'Paused'], ['ready', 'Ready to claim'], ['claimed', 'Claimed']].map(([value, label]) => this.option(value, label, filters.campaignStatus)).join('')}</select></label><label>Sort by<select data-qh-filter="campaignSort" data-qh-focus="campaign-sort">${[['recommended', 'Recommended'], ['title', 'Name'], ['progress', 'Progress'], ['reward', 'XP reward']].map(([value, label]) => this.option(value, label, filters.campaignSort)).join('')}</select></label></div>
      <p class="qh-result-count">${campaigns.length} ${campaigns.length === 1 ? 'campaign' : 'campaigns'}</p><div class="qh-grid">${campaigns.map(campaign => `<article class="qh-card ${campaign.active ? 'qh-active-card' : ''}"><div class="qh-card-meta"><span class="qh-pill">${this.escape(campaign.level)}</span><span class="qh-muted">${this.escape({ new: 'Not started', active: 'Active', paused: 'Paused', ready: 'Ready to claim', claimed: 'Reward claimed' }[status(campaign)])}</span></div><h4>${this.escape(campaign.title)}</h4><p>${this.escape(campaign.description)}</p><div class="qh-reward">+${campaign.xp} XP · +${campaign.coins} coins</div>${this.progress(campaign.value, campaign.max, `${campaign.title} progress`)}<p class="qh-muted">${campaign.value} / ${campaign.max} steps</p><ol class="qh-steps">${campaign.topics.map(key => `<li class="${campaign.steps.includes(key) ? 'qh-done' : ''}"><span role="img" aria-label="${campaign.steps.includes(key) ? 'Complete' : 'Pending'}">${campaign.steps.includes(key) ? '✓' : '○'}</span>${this.topicButton(key, this.title(key))}</li>`).join('')}</ol><div class="qh-actions">${campaign.claimed ? this.topicButton(campaign.topics[0], 'Revisit campaign →') : campaign.value >= campaign.max ? this.button('claim-campaign', 'Claim reward', campaign.id, { primary: true }) : this.button('start-campaign', campaign.started ? 'Continue campaign →' : 'Accept campaign →', campaign.id, { primary: true })}${campaign.active ? this.button('pause-campaign', 'Pause campaign', campaign.id) : ''}</div></article>`).join('') || this.empty('No campaigns match. Try another search or filter.')}</div>`;
  }

  knowledgeView() {
    const { engine, filters } = this;
    const stats = engine.quizStats();
    const missed = engine.quizzes.filter(quiz => engine.state.quizzes[quiz.id] && !engine.state.quizzes[quiz.id].correct);
    const quizzes = filters.quizMode === 'missed' ? missed : filters.quizMode === 'daily' ? [engine.dailyQuiz()].filter(Boolean) : engine.quizzes;
    const selected = quizzes.find(quiz => quiz.id === this.selectedQuiz) || quizzes[0];
    if (selected) this.selectedQuiz = selected.id;
    const answer = selected && engine.state.quizzes[selected.id];
    return `<div class="qh-section-intro"><h4>Turn a good guess into understanding</h4><p>Choose an answer, read the explanation, and revisit missed questions. Each question rewards its first correct answer once.</p></div><div class="qh-inline-stats"><span><strong>${stats.solved} / ${stats.total}</strong> mastered</span><span><strong>${stats.attempts}</strong> attempts</span><span><strong>${stats.accuracy}%</strong> accuracy</span><span><strong>${missed.length}</strong> to revisit</span></div>
      <div class="qh-filters"><label>Question collection<select data-qh-field="quiz-mode" data-qh-focus="quiz-mode">${[['all', 'All knowledge checks'], ['missed', `Missed questions (${missed.length})`], ['daily', 'Daily knowledge check']].map(([value, label]) => this.option(value, label, filters.quizMode)).join('')}</select></label>${quizzes.length ? `<label>Choose a question<select data-qh-field="quiz-choice" data-qh-focus="quiz-choice">${quizzes.map(quiz => this.option(quiz.id, `${engine.state.solvedQuizzes.includes(quiz.id) ? '✓ ' : ''}${this.title(quiz.topic)}`, this.selectedQuiz)).join('')}</select></label>` : ''}</div>
      ${selected ? `<article class="qh-card qh-quiz"><span class="eyebrow">${this.escape(this.title(selected.topic))}${filters.quizMode === 'daily' ? ' · Daily pick' : ''}</span><form data-qh-form="quiz"><fieldset${answer ? ' disabled' : ''}><legend>${this.escape(selected.question)}</legend><div class="qh-answer-options">${selected.options.map((option, index) => `<label class="qh-answer ${answer?.answer === index ? answer.correct ? 'qh-correct' : 'qh-incorrect' : ''}"><input type="radio" name="qh-answer" value="${index}" required data-qh-focus="answer:${selected.id}:${index}"${(answer?.answer ?? this.answerDrafts[selected.id]) === index ? ' checked' : ''}><span>${this.escape(option)}</span></label>`).join('')}</div></fieldset>${!answer ? '<button class="primary-btn" type="submit" data-qh-focus="check-answer">Check answer</button>' : ''}</form>${answer ? `<div class="qh-explanation ${answer.correct ? 'qh-correct' : 'qh-incorrect'}"><strong>${answer.correct ? '✓ Correct — knowledge earned.' : 'Keep exploring — here is the idea.'}</strong><p>${this.escape(selected.explanation)}</p><p>Correct answer: ${this.escape(selected.options[selected.answer])}</p></div><div class="qh-actions">${this.button('retry-quiz', answer.correct ? 'Practice this question again' : 'Try again', selected.id)}${this.button('next-quiz', 'Next question →', selected.id)}</div>` : '<p class="qh-footnote">There is no time limit. A wrong answer never removes progress.</p>'}${this.topicButton(selected.topic, 'Explore the related lab →')}</article>` : this.empty('No missed questions right now. Try a knowledge check from the full collection.')} `;
  }

  sprintView() {
    const { state } = this.engine;
    const sprint = state.sprint;
    const history = state.sprintHistory || [];
    const rewards = Object.values(state.sprintRewards);
    const today = this.engine.dateKey();
    const current = sprint?.started === today;
    const live = current && sprint.status !== 'complete';
    const rewarded = !!state.sprintRewards[today];
    return `<article class="qh-card"><span class="eyebrow">Focus sprint</span><h4>A little structure, at your pace</h4><p>Successfully run distinct labs toward a small daily target. No countdown, no pressure. Pause and resume during the same day.</p>${sprint ? `<div class="qh-card-meta"><strong>${sprint.topics.length} / ${sprint.target} labs</strong><span class="qh-pill">${current ? sprint.status === 'complete' ? 'Completed today' : this.escape(sprint.status) : 'Previous sprint'}</span></div>${this.progress(sprint.topics.length, sprint.target, 'Focus sprint progress')}<ul class="qh-compact-list">${sprint.topics.map(key => `<li>✓ ${this.escape(this.title(key))}</li>`).join('')}</ul>${live ? `<div class="qh-actions">${this.button('toggle-sprint', sprint.status === 'paused' ? 'Resume sprint' : 'Pause sprint')}${this.button('cancel-sprint', 'End sprint')}</div>` : ''}` : ''}${rewarded ? '<p class="qh-reward">✓ Daily sprint reward earned. Start a fresh sprint tomorrow.</p>' : !live ? `<div class="qh-actions">${[2, 3, 5].map(target => this.button('start-sprint', `${target}-lab sprint`, target, { primary: target === 3 })).join('')}</div><p class="qh-footnote">Earn 15 XP and 10 coins per target lab, once per day.</p>` : `<p class="qh-footnote">Finish this sprint for ${sprint.target * 15} XP and ${sprint.target * 10} coins.</p>`}<p class="qh-muted">${rewards.length} finished · Personal best: ${rewards.length ? Math.max(...rewards.map(item => item.target)) : 0} distinct labs in a sprint</p>${history.length ? `<details data-qh-details="sprint-history"><summary data-qh-focus="sprint-history">Completed sprint history</summary><ul class="qh-compact-list">${history.slice(-8).reverse().map(item => `<li>${this.escape(item.started)} · ${item.target} labs</li>`).join('')}</ul></details>` : ''}</article>`;
  }

  practiceView() {
    const { engine } = this;
    const { state } = engine;
    const key = this.selectedTopic;
    const notes = Object.entries(state.notes).filter(([topic, note]) => `${this.title(topic)} ${note}`.toLowerCase().includes(this.filters.noteSearch.toLowerCase()));
    return `<div class="qh-section-intro"><h4>Build your own practice ritual</h4><p>Save useful labs, plan a sequence, and capture what you learned. Your reflections stay on this device.</p></div><div class="qh-grid">${this.sprintView()}<article class="qh-card"><span class="eyebrow">Your practice queue</span><h4>One lab, then the next</h4>${state.queue.length ? `<ol class="qh-queue">${state.queue.map((topic, index) => `<li><div><span class="qh-queue-number">${index + 1}</span>${this.topicButton(topic, this.title(topic))}</div><div class="qh-queue-controls">${this.button('queue-up', '↑', topic, { disabled: index === 0, aria: `Move ${this.title(topic)} up` })}${this.button('queue-down', '↓', topic, { disabled: index === state.queue.length - 1, aria: `Move ${this.title(topic)} down` })}${this.button('dequeue', 'Remove', topic, { aria: `Remove ${this.title(topic)} from queue` })}</div></li>`).join('')}</ol>${this.topicButton(engine.recommendedTopic('queue'), 'Resume queue →', { primary: true })}<p class="qh-footnote">A successful run removes its lab from your queue.</p>` : this.empty('Your queue is ready for its first lab. Add one below.')}</article></div>
      <article class="qh-card qh-topic-workbench"><span class="eyebrow">Personal lab notebook</span><label>Choose a lab<select data-qh-field="practice-topic" data-qh-focus="practice-topic">${Object.keys(engine.topics).map(topic => this.option(topic, this.title(topic), key)).join('')}</select></label><div class="qh-actions">${this.topicButton(key)}${this.button('favorite', state.favorites.includes(key) ? '★ Saved to favorites' : '☆ Save favorite', key, { pressed: state.favorites.includes(key) })}${this.button('enqueue', state.queue.includes(key) ? 'In practice queue' : 'Add to practice queue', key, { disabled: state.queue.includes(key) })}</div><label>How confident do you feel?<select data-qh-field="confidence" data-qh-focus="confidence">${[[0, 'Not rated yet'], [1, '1 · I want more practice'], [2, '2 · Getting comfortable'], [3, '3 · I can explain it']].map(([value, label]) => this.option(String(value), label, String(state.confidence[key] || 0)).replace('value="0"', 'value="0" disabled')).join('')}</select></label><form data-qh-form="note"><label for="qh-note">Reflection for this lab</label><textarea id="qh-note" aria-describedby="qh-note-status" data-qh-field="note" data-qh-focus="note" rows="4" maxlength="1000" placeholder="What clicked? What would you like to try next?">${this.escape(this.noteDrafts[key] ?? state.notes[key] ?? '')}</textarea><div class="qh-actions"><button type="submit" class="primary-btn" data-qh-focus="save-note">Save reflection</button>${this.button('clear-note', 'Clear reflection', key, { disabled: !(state.notes[key] || this.noteDrafts[key]) })}<button type="button" class="secondary-btn" data-qh-action="discard-note" data-value="${this.escape(key)}" data-qh-focus="discard-note:${this.escape(key)}"${this.noteDirty(key) ? '' : ' hidden'}>Discard unsaved changes</button><span id="qh-note-status" class="qh-muted">${this.noteStatus(key)}</span></div></form></article>
      <div class="qh-grid"><article class="qh-card"><span class="eyebrow">Favorites</span><h4>Your go-to labs</h4>${state.favorites.length ? `<ul class="qh-lab-list">${state.favorites.map(topic => `<li>${this.topicButton(topic, this.title(topic))}${this.button('favorite', 'Remove', topic, { aria: `Remove ${this.title(topic)} from favorites` })}</li>`).join('')}</ul>${this.topicButton(engine.recommendedTopic('favorite'), 'Practice a favorite →')}` : this.empty('Star a lab in the notebook to keep it close.')}</article><article class="qh-card"><span class="eyebrow">Reflection journal</span><h4>Find an insight again</h4><label>Search reflections<input type="search" data-qh-filter="noteSearch" data-qh-focus="note-search" value="${this.escape(this.filters.noteSearch)}" placeholder="A topic or something you learned"></label><div class="qh-notes">${notes.map(([topic, note]) => `<article><h5>${this.escape(this.title(topic))}</h5><p>${this.escape(note)}</p>${this.button('edit-note', 'Edit reflection', topic)}</article>`).join('') || this.empty('No saved reflections match. Write one in the notebook above.')}</div></article></div>`;
  }

  profileView() {
    const { engine } = this;
    const { state } = engine;
    return `<div class="qh-section-intro"><h4>A profile that feels like you</h4><p>Pick an identity for your learning journey. Every cosmetic uses coins earned through practice.</p></div><div class="qh-grid"><article class="qh-card"><span class="eyebrow">Explorer identity</span><form data-qh-form="profile"><label for="qh-alias">Display name</label><div class="qh-inline-form"><input id="qh-alias" data-qh-field="alias" data-qh-focus="alias" maxlength="32" value="${this.escape(this.aliasDraft)}" placeholder="Explorer"><button type="submit" class="primary-btn" data-qh-focus="save-profile">Save name</button></div></form><fieldset class="qh-avatar-picker"><legend>Choose an avatar</legend><div class="qh-actions">${[['compass', '◈ Compass'], ['rocket', '↗ Rocket'], ['bolt', 'ϟ Bolt'], ['leaf', '❧ Leaf']].map(([value, label]) => this.button('avatar', label, value, { pressed: state.avatar === value })).join('')}</div></fieldset><label>Learning specialty<select data-qh-field="specialty" data-qh-focus="specialty">${[['all', 'Explore everything'], ['foundation', 'Foundation skills'], ['intermediate', 'Applied engineering'], ['advanced', 'Advanced systems']].map(([value, label]) => this.option(value, label, state.specialty)).join('')}</select></label><p class="qh-footnote">Your specialty shapes the recommendation in Overview.</p></article><article class="qh-card"><span class="eyebrow">Your showcase</span><h4>${this.escape(state.title || 'Explorer')}</h4><p>${this.escape(state.alias || 'Explorer')} · ${this.escape(state.avatar)} avatar · ${this.escape(state.theme)} theme</p><p class="qh-muted">Earn coins through practice, unlock a title in the shop, and equip it to make it yours.</p>${this.button('default-theme', 'Use default theme')}${this.button('default-title', 'Use default title')}</article></div>
      <div class="qh-section-intro"><h4>Cosmetic shop <span class="qh-pill">${engine.coins()} coins available</span></h4><p>Permanent unlocks, clear prices. Changing your look never changes your score.</p></div><div class="qh-shop">${engine.shop.map(item => {
        const owned = state.purchases.includes(item.id);
        const equipped = state[item.type] === item.value;
        return `<article class="qh-card"><span class="qh-cosmetic qh-cosmetic-${this.escape(item.value.toLowerCase())}" aria-hidden="true">${item.type === 'theme' ? '◈' : '✧'}</span><span class="eyebrow">${this.escape(item.type)}</span><h4>${this.escape(item.label)}</h4><p>${owned ? 'In your collection' : `${item.cost} coins`}</p>${owned ? this.button('equip', equipped ? '✓ Equipped' : 'Equip', item.id, { disabled: equipped, primary: !equipped }) : this.button('buy', engine.coins() >= item.cost ? `Unlock · ${item.cost} coins` : `Need ${item.cost - engine.coins()} more coins`, item.id, { disabled: engine.coins() < item.cost })}</article>`;
      }).join('')}</div><p class="qh-footnote">Collection: ${state.purchases.length} / ${engine.shop.length} cosmetics owned. Unlocks and your equipped look are included in progress exports.</p>`;
  }

  totalXP() {
    const journey = this.engine.journey;
    return (journey?.state.runs.length || 0) * 20 + (journey?.completed.size || 0) * 50 + (journey?.bonusXP() || 0) + this.engine.xp();
  }

  calendarView() {
    const summary = this.engine.monthSummary(this.month);
    const [year, month] = this.month.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    const count = new Date(year, month, 0).getDate();
    const offset = (date.getDay() + 6) % 7;
    const dayMap = new Map(summary.days.map(day => [day.day, day]));
    return `<article class="qh-card"><div class="qh-card-meta"><div><span class="eyebrow">Monthly rhythm</span><h4>${this.escape(date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}</h4></div><div class="qh-actions">${this.button('month-prev', '←', '', { aria: 'Previous month', disabled: this.month <= '2000-01' })}${this.button('month-next', '→', '', { aria: 'Next month', disabled: this.month >= this.localMonth() })}</div></div><div class="qh-calendar" role="list" aria-label="Daily successful lab activity">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => `<span class="qh-weekday" aria-hidden="true">${day}</span>`).join('')}${Array.from({ length: offset }, () => '<span aria-hidden="true"></span>').join('')}${Array.from({ length: count }, (_, index) => {
      const day = `${this.month}-${String(index + 1).padStart(2, '0')}`;
      const activity = dayMap.get(day)?.count || 0;
      return `<span role="listitem" class="qh-day${activity ? ' qh-day-active' : ''}${day === this.engine.dateKey() ? ' qh-day-today' : ''}" aria-label="${day}: ${activity} distinct successful labs" title="${day}: ${activity} labs"><span aria-hidden="true">${index + 1}</span><small aria-hidden="true">${activity || '·'}</small></span>`;
    }).join('')}</div><p class="qh-muted">${summary.activeDays} active days · ${summary.runs} daily lab completions · ${summary.uniqueTopics} distinct topics</p></article>`;
  }

  progressView() {
    const { engine } = this;
    const { state } = engine;
    const stats = engine.stats();
    const totalXP = this.totalXP();
    const level = Math.floor(totalXP / 250) + 1;
    const baseRuns = (engine.journey?.state.runs.length || 0) * 20;
    const baseCompletion = (engine.journey?.completed.size || 0) * 50;
    const milestones = engine.milestones();
    const masteryLabels = ['Not explored', 'Explored', 'Practiced', 'Mastered'];
    const topicMasteries = Object.keys(engine.topics).map(key => ({ key, mastery: engine.mastery(key) })).filter(item => this.filters.mastery === 'all' || String(typeof item.mastery === 'number' ? item.mastery : item.mastery.tier) === this.filters.mastery);
    return `<div class="qh-section-intro"><h4>See what your practice is building</h4><p>Progress is personal. Every skill, reflection, and return visit adds to your story.</p></div><div class="qh-grid"><article class="qh-card"><span class="eyebrow">Your experience</span><h4>Level ${level} · ${totalXP} XP</h4>${this.progress(totalXP % 250, 250, `Progress to level ${level + 1}`)}<p>${250 - totalXP % 250} XP to level ${level + 1}</p><dl class="qh-breakdown"><div><dt>First successful lab runs</dt><dd>${baseRuns} XP</dd></div><div><dt>Marked completions</dt><dd>${baseCompletion} XP</dd></div><div><dt>Journey mission rewards</dt><dd>${engine.journey?.bonusXP() || 0} XP</dd></div><div><dt>Quest hub rewards</dt><dd>${engine.xp()} XP</dd></div><div><dt>Coins earned / spent</dt><dd>${stats.earnedCoins} / ${stats.spentCoins}</dd></div></dl></article><article class="qh-card"><span class="eyebrow">Your weekly intention</span><h4>A goal that fits your week</h4><label>Distinct labs this week<select data-qh-field="weekly-target" data-qh-focus="weekly-target">${[3, 5, 10, 15].map(value => this.option(String(value), `${value} labs`, String(state.weeklyTarget))).join('')}</select></label>${this.progress(stats.weeklyCount, stats.weeklyTarget, 'Personal weekly goal')}<p>${stats.weeklyCount} / ${stats.weeklyTarget} labs · ${stats.weeklyCount >= stats.weeklyTarget ? 'Goal reached. Well done.' : `${Math.max(0, stats.weeklyTarget - stats.weeklyCount)} to go.`}</p><p class="qh-footnote">Counts distinct successful labs from Monday through Sunday in your local calendar.</p>${this.topicButton(engine.recommendedTopic(), 'Choose your next lab →')}</article></div>
      <div class="qh-section-intro"><h4>Milestone ladder</h4><p>Claim each earned reward once. Pin a claimed milestone to celebrate it in Overview.</p></div><div class="qh-milestones">${milestones.map((milestone, index) => `<article class="qh-card ${milestone.claimed ? 'qh-claimed' : ''}"><div class="qh-card-meta"><span class="qh-milestone-number">${String(index + 1).padStart(2, '0')}</span>${state.pinnedMilestone === milestone.id ? '<span class="qh-pill">Pinned</span>' : ''}</div><h4>${this.escape(milestone.title)}</h4><p>${this.escape(milestone.description)}</p>${this.progress(milestone.value, milestone.max, `${milestone.title} progress`)}<p>${Math.min(milestone.value, milestone.max)} / ${milestone.max}</p><span class="qh-reward">+${milestone.xp} XP · +${milestone.coins} coins</span><div class="qh-actions">${this.button('claim-milestone', milestone.claimed ? '✓ Claimed' : milestone.value >= milestone.max ? 'Claim reward' : 'Keep exploring', milestone.id, { primary: !milestone.claimed && milestone.value >= milestone.max, disabled: milestone.claimed || milestone.value < milestone.max })}${this.button('pin-milestone', state.pinnedMilestone === milestone.id ? 'Unpin' : 'Pin', milestone.id, { pressed: state.pinnedMilestone === milestone.id, disabled: !milestone.claimed })}</div></article>`).join('')}</div>
      <div class="qh-grid">${this.calendarView()}<article class="qh-card"><span class="eyebrow">Topic mastery</span><h4>Know where you stand</h4><p>Each topic gains one tier for a successful run, a marked completion, and a correct knowledge check where available.</p><label>Show mastery tier<select data-qh-filter="mastery" data-qh-focus="mastery-filter">${[['all', 'All topics'], ...masteryLabels.map((label, index) => [String(index), label])].map(([value, label]) => this.option(value, label, this.filters.mastery)).join('')}</select></label><ul class="qh-mastery">${topicMasteries.map(({ key, mastery }) => {
      const tier = typeof mastery === 'number' ? mastery : mastery.tier;
      return `<li>${this.topicButton(key, this.title(key))}<span class="qh-pill">${masteryLabels[tier] || 'Not explored'}</span></li>`;
    }).join('') || '<li>No topics at this tier yet.</li>'}</ul></article></div>
      <article class="qh-card qh-data"><span class="eyebrow">Your data, your choice</span><h4>Keep a copy of your quest progress</h4><p>Exports include your profile, quest rewards, queue, private reflections, and original learning journey. Import merges valid progress without removing existing learning history.</p><div class="qh-actions">${this.button('export', 'Download quest progress') }<label class="secondary-btn qh-file-label">Import quest progress<input type="file" accept="application/json,.json" data-qh-field="import" data-qh-focus="import" aria-label="Import quest progress JSON"></label></div><div class="qh-reset">${this.resetPending ? `<p>Reset all quest hub rewards, profile, favorites, queue, and reflections on this device? This cannot be undone. Your original journey remains.</p><div class="qh-actions">${this.button('confirm-reset', 'Yes, reset quest hub', '', { className: 'qh-danger' })}${this.button('cancel-reset', 'Keep my progress')}</div>` : this.button('reset', 'Reset quest hub…', '', { className: 'qh-text-button' })}</div></article>`;
  }

  handleInput(event) {
    const field = event.target.dataset.qhField;
    if (field === 'alias') this.aliasDraft = event.target.value;
    if (field === 'note') {
      this.noteDrafts[this.selectedTopic] = event.target.value;
      const clear = this.root.querySelector('[data-qh-action="clear-note"]');
      if (clear) clear.disabled = !(event.target.value || this.engine.state.notes[this.selectedTopic]);
      this.root.querySelector('#qh-note-status').textContent = this.noteStatus();
      this.root.querySelector('[data-qh-action="discard-note"]').hidden = !this.noteDirty();
    }
    const filter = event.target.dataset.qhFilter;
    if (filter && event.target.tagName === 'INPUT') { this.filters[filter] = event.target.value; this.render(); }
  }

  handleChange(event) {
    const value = event.target.value;
    const field = event.target.dataset.qhField;
    const filter = event.target.dataset.qhFilter;
    if (filter) { this.filters[filter] = value; this.render(); return; }
    if (event.target.name === 'qh-answer') this.answerDrafts[this.selectedQuiz] = Number(value);
    if (field === 'quiz-mode') { this.filters.quizMode = value; this.render(); }
    if (field === 'quiz-choice') { this.selectedQuiz = value; this.render(); }
    if (field === 'practice-topic') { this.selectedTopic = value; this.render(); }
    if (field === 'specialty') this.mutate('setProfile', ['specialty', value], 'Specialty updated. Your next recommendation is ready.');
    if (field === 'confidence') this.mutate('setConfidence', [this.selectedTopic, Number(value)], 'Confidence rating saved.');
    if (field === 'weekly-target') this.mutate('setProfile', ['weeklyTarget', Number(value)], 'Weekly intention updated.');
    if (field === 'import') this.importFile(event.target.files?.[0]);
  }

  handleSubmit(event) {
    const form = event.target.dataset.qhForm;
    if (!form) return;
    event.preventDefault();
    if (form === 'profile') this.mutate('setProfile', ['alias', this.aliasDraft], 'Display name saved.');
    if (form === 'note' && this.engine.saveNote(this.selectedTopic, this.noteDrafts[this.selectedTopic] ?? this.engine.state.notes[this.selectedTopic] ?? '')) {
      delete this.noteDrafts[this.selectedTopic];
      this.changed('Reflection saved.');
    }
    if (form === 'quiz') {
      const selected = event.target.querySelector('input[name="qh-answer"]:checked');
      if (!selected) return;
      const result = this.engine.answerQuiz(this.selectedQuiz, Number(selected.value));
      if (result && this.filters.quizMode === 'missed') this.filters.quizMode = 'all';
      if (result) this.changed(result.correct ? `Correct. ${result.earned ? 'First-correct reward earned.' : 'You have already earned this question’s reward.'}` : 'Not quite. Read the explanation, then try again when you are ready.');
    }
  }

  handleClick(event) {
    const tab = event.target.closest('[data-qh-tab]');
    if (tab) { this.selectTab(tab.dataset.qhTab); return; }
    const button = event.target.closest('[data-qh-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.qhAction;
    const value = button.dataset.value;
    const { engine } = this;
    if (action === 'tab') { this.selectTab(value); this.root.querySelector(`[data-qh-tab="${value}"]`).focus(); }
    if (action === 'topic') this.onTopic(value);
    if (action === 'featured') { if (engine.startFeatured()) this.changed('Daily featured challenge started. Run the lab successfully to earn its bonus.'); this.onTopic(engine.featuredTopic()); }
    if (action === 'surprise') { const key = engine.recommendedTopic('surprise'); if (key) this.onTopic(key); }
    if (action === 'favorite') this.mutate('toggleFavorite', [value], engine.state.favorites.includes(value) ? 'Lab removed from favorites.' : 'Lab saved to favorites.');
    if (action === 'enqueue') this.mutate('enqueue', [value], 'Lab added to your practice queue.');
    if (action === 'dequeue') this.mutate('dequeue', [value], 'Lab removed from your practice queue.');
    if (action === 'queue-up' || action === 'queue-down') this.mutate('moveQueue', [value, action === 'queue-up' ? -1 : 1], 'Practice queue reordered.');
    if (action === 'start-sprint') this.mutate('startSprint', [Number(value)], `${value}-lab sprint started. Successful runs will count toward your target.`);
    if (action === 'toggle-sprint') this.mutate('toggleSprint', [], engine.state.sprint?.status === 'paused' ? 'Focus sprint resumed.' : 'Focus sprint paused. Your steps are saved.');
    if (action === 'cancel-sprint') this.mutate('cancelSprint', [], 'Focus sprint ended. Your lab progress is kept.');
    if (action === 'start-campaign') { if (engine.startCampaign(value)) { this.changed('Campaign active. Successfully run its labs to advance.'); const next = engine.campaignProgress(value).next; if (next) this.onTopic(next); } }
    if (action === 'pause-campaign') this.mutate('pauseCampaign', [], 'Campaign paused. Its completed steps are saved.');
    if (action === 'claim-campaign') this.mutate('claimCampaign', [value], 'Campaign reward claimed.');
    if (action === 'retry-quiz') { this.filters.quizMode = 'all'; this.selectedQuiz = value; delete this.answerDrafts[value]; this.mutate('retryQuiz', [value], 'Question ready for another try.'); }
    if (action === 'next-quiz') {
      const list = this.filters.quizMode === 'missed' ? engine.quizzes.filter(quiz => engine.state.quizzes[quiz.id] && !engine.state.quizzes[quiz.id].correct) : engine.quizzes;
      this.selectedQuiz = list[(list.findIndex(quiz => quiz.id === value) + 1) % list.length]?.id;
      if (this.filters.quizMode === 'daily') this.filters.quizMode = 'all';
      this.render();
    }
    if (action === 'avatar') this.mutate('setProfile', ['avatar', value], 'Avatar updated.');
    if (action === 'buy') this.mutate('buy', [value], 'Cosmetic unlocked. Equip it whenever you like.');
    if (action === 'equip') this.mutate('equip', [value], 'Cosmetic equipped.');
    if (action === 'default-theme') this.mutate('setProfile', ['theme', 'default'], 'Default theme restored.');
    if (action === 'default-title') this.mutate('setProfile', ['title', 'Learner'], 'Default title restored.');
    if (action === 'clear-note') { delete this.noteDrafts[value]; this.mutate('saveNote', [value, ''], 'Reflection cleared.'); }
    if (action === 'discard-note') { delete this.noteDrafts[value]; this.render(); this.announce('Unsaved changes discarded. Your saved reflection is unchanged.'); this.root.querySelector('#qh-note').focus(); }
    if (action === 'edit-note') { this.selectedTopic = value; this.render(); this.root.querySelector('#qh-note').focus(); }
    if (action === 'claim-milestone') this.mutate('claimMilestone', [value], 'Milestone reward claimed.');
    if (action === 'pin-milestone') this.mutate('setProfile', ['pinnedMilestone', engine.state.pinnedMilestone === value ? null : value], engine.state.pinnedMilestone === value ? 'Milestone unpinned.' : 'Milestone pinned.');
    if (action === 'month-prev' || action === 'month-next') { const [year, month] = this.month.split('-').map(Number); const date = new Date(year, month - 1 + (action === 'month-prev' ? -1 : 1), 1); this.month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; this.render(); }
    if (action === 'export') this.exportData();
    if (action === 'reset' || action === 'cancel-reset') { this.resetPending = action === 'reset'; this.render(); this.root.querySelector(`[data-qh-action="${this.resetPending ? 'cancel-reset' : 'reset'}"]`)?.focus(); }
    if (action === 'confirm-reset') { engine.reset(); this.aliasDraft = engine.state.alias; this.noteDrafts = {}; this.answerDrafts = {}; this.resetPending = false; this.changed('Quest hub reset. Your original learning journey is unchanged.'); }
  }

  exportData() {
    const blob = new Blob([this.engine.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backend-lab-quests-${this.engine.dateKey()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.announce('Quest progress downloaded. Keep the file private if it contains personal reflections.');
  }

  async importFile(file) {
    if (!file) return;
    if (file.size > 200000) { this.announce('Choose a quest export smaller than 200 KB.'); return; }
    try {
      const payload = await file.text();
      const drafts = Object.fromEntries(Object.entries(this.noteDrafts).filter(([topic]) => this.noteDirty(topic)));
      const result = this.engine.importData(payload);
      if (!result.ok) { this.announce(result.error || 'This file is not a valid quest progress export.'); return; }
      this.aliasDraft = this.engine.state.alias;
      // Keep unsaved reflections when merging a backup; they are not part of the export.
      this.noteDrafts = drafts;
      this.answerDrafts = {};
      this.changed('Quest progress merged successfully.');
    } catch { this.announce('The file could not be read. Choose a valid quest progress JSON export.'); }
    finally { const input = this.root.querySelector('[data-qh-field="import"]'); if (input) input.value = ''; }
  }
}
