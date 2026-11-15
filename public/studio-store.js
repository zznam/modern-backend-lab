/* Browser-local study workspace. No profile or content is sent to the server. */
(() => {
  const KEY = 'backend-lab-studio-v1';
  const kinds = ['notes', 'cards', 'plans', 'snippets', 'decisions', 'scenarios'];
  const object = v => v && typeof v === 'object' && !Array.isArray(v);
  const str = (v, max = 200) => typeof v === 'string' ? v.slice(0, max) : '';
  const num = (v, lo, hi, fallback = lo) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
  const list = v => Array.isArray(v) ? v : [];
  const choice = (v, values, fallback = values[0]) => values.includes(v) ? v : fallback;
  const day = v => { const d = new Date(`${v}T00:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : ''; };
  const clone = v => JSON.parse(JSON.stringify(v));
  const uid = () => globalThis.crypto?.randomUUID?.() || `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const csv = rows => rows.map(row => row.map(value => { let s = String(value ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"', '""')}"`; }).join(',')).join('\r\n');
  class StudyStore {
    constructor({ topics, quizzes = [], storage, now = () => Date.now() }) {
      this.topics = topics; this.quizzes = quizzes; this.now = now; this.storage = storage;
      this.storageError = storage ? '' : 'Storage unavailable. Changes stay in this tab. Export a backup before leaving.'; this.state = this.read();
    }
    known(v) { return typeof v === 'string' && Object.hasOwn(this.topics, v); }
    title(key) { return this.topics[key]?.title || key; }
    read() {
      try { return this.normalize(JSON.parse(this.storage?.getItem(KEY) || '{}')); }
      catch { this.storageError = 'Storage unavailable or unreadable. Changes stay in this tab until a save succeeds. Export a backup.'; return this.state || this.normalize({}); }
    }
    params(v) {
      return Object.fromEntries(Object.entries(object(v) ? v : {}).filter(([k, n]) => /^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(k) && !['constructor', 'prototype', '__proto__'].includes(k) && Number.isFinite(n) && Math.abs(n) <= 1000000).slice(0, 30));
    }
    entity(kind, value) {
      const v = object(value) ? value : {};
      const common = { id: str(v.id, 80) || uid(), title: str(v.title), topic: this.known(v.topic) ? v.topic : '',
        created: num(v.created, 0, this.now(), this.now()), updated: num(v.updated, 0, this.now(), this.now()),
        pinned: v.pinned === true, archived: v.archived === true, tags: [...new Set(list(v.tags).map(t => str(t, 32).trim()).filter(Boolean))].slice(0, 10) };
      if (kind === 'notes') return { ...common, body: str(v.body, 12000), runId: str(v.runId, 80) };
      if (kind === 'snippets') return { ...common, body: str(v.body, 12000), language: choice(v.language, ['text', 'javascript', 'typescript', 'sql', 'go', 'bash', 'json']), description: str(v.description, 2000) };
      if (kind === 'cards') return { ...common, back: str(v.back, 4000), deck: str(v.deck, 80) || 'General', due: num(v.due, 0, 8640000000000000, this.now()), interval: num(v.interval, 0, 365), reviews: Math.floor(num(v.reviews, 0, 100000)), lapses: Math.floor(num(v.lapses, 0, 100000)), suspended: v.suspended === true };
      if (kind === 'plans') return { ...common, description: str(v.description, 2000), due: day(str(v.due)), steps: list(v.steps).filter(s => object(s) && this.known(s.topic)).slice(0, 100).map(s => ({ id: str(s.id, 80) || uid(), topic: s.topic, status: choice(s.status, ['todo', 'doing', 'done']), due: day(str(s.due)) })) };
      if (kind === 'decisions') return { ...common, context: str(v.context, 4000), options: str(v.options, 4000), outcome: str(v.outcome, 4000), consequences: str(v.consequences, 4000), status: choice(v.status, ['proposed', 'accepted', 'rejected', 'superseded']), runId: str(v.runId, 80), supersedes: str(v.supersedes, 80) };
      if (kind === 'scenarios') return { ...common, params: this.params(v.params), prediction: str(v.prediction, 2000) };
      throw new Error('Unknown collection');
    }
    normalize(raw) {
      const v = object(raw) ? raw : {};
      const p = object(v.settings) ? v.settings : {};
      const state = { version: 1, settings: { theme: choice(p.theme, ['system', 'dark', 'light']), density: choice(p.density, ['comfortable', 'compact']), text: choice(p.text, ['normal', 'large']), motion: choice(p.motion, ['system', 'reduce']), capture: p.capture !== false, retention: choice(p.retention, [25, 50, 100], 50) }, bookmarks: [...new Set(list(v.bookmarks).filter(k => this.known(k)))], runs: [], exams: [], activeExam: null };
      for (const kind of kinds) {
        const ids = new Set();
        state[kind] = list(v[kind]).filter(object).slice(0, 300).map(e => this.entity(kind, e)).filter(e => { if (!e.title || ids.has(e.id)) return false; ids.add(e.id); return true; });
      }
      const runIds = new Set();
      state.runs = list(v.runs).filter(r => object(r) && this.known(r.topic)).slice(0, 100).map(r => ({ id: str(r.id, 80) || uid(), topic: r.topic, title: str(r.title) || this.title(r.topic), at: num(r.at, 0, this.now(), this.now()), duration: num(r.duration, 0, 3600000), params: this.params(r.params), result: this.safeResult(r.result), pinned: r.pinned === true, label: str(r.label) })).filter(r => { if (runIds.has(r.id)) return false; runIds.add(r.id); return true; });
      const pinned = state.runs.filter(r => r.pinned);
      if (pinned.length > state.settings.retention) state.settings.retention = pinned.length <= 50 ? 50 : 100;
      state.runs = [...pinned, ...state.runs.filter(r => !r.pinned).slice(0, state.settings.retention - pinned.length)].sort((a,b) => b.at - a.at);
      state.baseline = state.runs.some(r => r.id === v.baseline) ? v.baseline : '';
      const exam = rawExam => {
        if (!object(rawExam)) return null;
        const questions = [...new Set(list(rawExam.questions).filter(id => this.quizzes.some(q => q.id === id)))].slice(0, 50);
        if (!questions.length) return null;
        const answers = Object.fromEntries(questions.filter(id => Number.isInteger(rawExam.answers?.[id]) && rawExam.answers[id] >= 0 && rawExam.answers[id] < this.quizzes.find(q => q.id === id).options.length).map(id => [id, rawExam.answers[id]]));
        return { id: str(rawExam.id, 80) || uid(), questions, answers, flagged: [...new Set(list(rawExam.flagged).filter(id => questions.includes(id)))], index: Math.floor(num(rawExam.index, 0, questions.length - 1)), started: num(rawExam.started, 0, this.now(), this.now()), deadline: num(rawExam.deadline, 0, 8640000000000000), finished: num(rawExam.finished, 0, this.now()), reason: choice(rawExam.reason, ['submitted', 'timeout', 'abandoned']) };
      };
      state.activeExam = exam(v.activeExam);
      if (state.activeExam?.finished) state.activeExam = null;
      state.exams = list(v.exams).slice(0, 50).map(exam).filter(e => e && e.finished);
      return state;
    }
    safeResult(v) {
      try { const json = JSON.stringify(v ?? null); return new Blob([json]).size <= 24000 ? JSON.parse(json) : { summary: 'Result exceeded the 24 KB history limit. Use the lab JSON output for the full result.' }; }
      catch { return null; }
    }
    transact(fn) {
      // Read the latest persisted state before each write, so separate tabs do not overwrite unrelated edits.
      if (!this.storageError) this.state = this.read();
      const next = clone(this.state);
      const result = fn(next);
      const normalized = this.normalize(next);
      const serialized = JSON.stringify(normalized);
      if (new Blob([serialized]).size > 3000000) throw new Error('Workspace limit reached (3 MB). Export and remove older records before adding more.');
      this.state = normalized;
      try { if (!this.storage) throw new Error('Unavailable'); this.storage.setItem(KEY, serialized); this.storageError = ''; }
      catch { this.storageError = 'Storage unavailable or full. Changes are only in this tab. Download a backup before leaving.'; }
      return result;
    }
    save(kind, input) {
      if (!kinds.includes(kind) || !object(input)) throw new Error('Invalid record');
      const id = input.id || uid();
      this.transact(state => {
        const old = state[kind].find(e => e.id === id);
        input = { ...old, ...input };
        if (!str(input.title).trim()) throw new Error('A title or question is required.');
        if (kind === 'cards' && !str(input.back, 4000).trim()) throw new Error('An answer is required.');
        if (kind === 'scenarios' && !this.known(input.topic)) throw new Error('Choose a lab for this scenario.');
        if (kind === 'scenarios' && (!object(input.params) || Object.keys(input.params).length !== Object.keys(this.params(input.params)).length)) throw new Error('Parameters must be an object of finite numbers with valid parameter names.');
        if (!old && state[kind].length >= 300) throw new Error('Collection limit reached (300). Export and remove older records first.');
        const record = this.entity(kind, { ...old, ...input, id, created: old?.created ?? this.now(), updated: this.now() });
        state[kind] = [record, ...state[kind].filter(e => e.id !== id)];
        if (kind === 'decisions' && record.status === 'accepted' && record.supersedes && record.supersedes !== record.id) {
          const previous = state.decisions.find(e => e.id === record.supersedes);
          if (previous) previous.status = 'superseded';
        }
      });
      return id;
    }
    remove(kind, id) { if (!kinds.includes(kind) && kind !== 'runs') throw new Error('Invalid collection'); this.transact(s => { s[kind] = s[kind].filter(e => e.id !== id); }); }
    toggle(kind, id, field) {
      if (!['pinned', 'archived', 'suspended'].includes(field) || (!kinds.includes(kind) && kind !== 'runs')) throw new Error('Invalid toggle');
      this.transact(s => { const e = s[kind].find(e => e.id === id); if (e) e[field] = !e[field]; });
    }
    duplicate(kind, id) { const e = this.state[kind]?.find(e => e.id === id); if (!e) throw new Error('Record not found'); return this.save(kind, { ...e, id: undefined, title: `${e.title} (copy)`, pinned: false }); }
    query(kind, { search = '', topic = '', tag = '', status = 'active', sort = 'newest', language = '', deck = '' } = {}) {
      const rows = this.state[kind] || [];
      return rows.filter(e => (!topic || e.topic === topic) && (!tag || e.tags?.includes(tag)) && (!language || e.language === language) && (!deck || e.deck === deck) && (status === 'all' || (status === 'pinned' ? e.pinned : status === 'archived' ? e.archived : !e.archived)) && JSON.stringify(e).toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : sort === 'duration' ? b.duration - a.duration : sort === 'oldest' ? (a.at || a.created) - (b.at || b.created) : (b.at || b.updated) - (a.at || a.updated));
    }
    capture(topic, params, response) {
      if (!this.known(topic) || !object(response) || !Object.hasOwn(response, 'data')) return;
      this.transact(s => {
        if (!s.settings.capture) return;
        if (s.runs.filter(r => r.pinned).length >= s.settings.retention) throw new Error('History is full of pinned evidence. Unpin a run or increase retention in Study studio.');
        s.runs.unshift({ id: uid(), topic, title: this.title(topic), params: this.params(params), at: this.now(), duration: num(response.executionDurationMs, 0, 3600000), result: this.safeResult(response.data), pinned: false, label: '' });
        const pins = s.runs.filter(r => r.pinned);
        s.runs = [...pins, ...s.runs.filter(r => !r.pinned).slice(0, Math.max(0, s.settings.retention - pins.length))].sort((a, b) => b.at - a.at).slice(0, 100);
      });
    }
    labelRun(id, label) { this.transact(s => { const r = s.runs.find(r => r.id === id); if (r) r.label = str(label); }); }
    baseline(id) { this.transact(s => { s.baseline = s.runs.some(r => r.id === id) ? id : ''; }); }
    compare(id) {
      const a = this.state.runs.find(r => r.id === this.state.baseline), b = this.state.runs.find(r => r.id === id);
      if (!a || !b || a.topic !== b.topic) throw new Error('Choose a baseline from the same lab first.');
      const metrics = r => Object.fromEntries(list(r.result?.metrics).map(m => [str(m.label), m.value]));
      const left = { durationMs: a.duration, ...a.params, ...metrics(a) }, right = { durationMs: b.duration, ...b.params, ...metrics(b) };
      return [...new Set([...Object.keys(left), ...Object.keys(right)])].map(key => ({ key, before: left[key] ?? '—', after: right[key] ?? '—', delta: typeof left[key] === 'number' && typeof right[key] === 'number' ? right[key] - left[key] : '' }));
    }
    dueCards(deck = '') { return this.state.cards.filter(c => !c.suspended && !c.archived && c.due <= this.now() && (!deck || c.deck === deck)).sort((a, b) => a.due - b.due); }
    gradeCard(id, grade) {
      if (!['again', 'hard', 'good', 'easy'].includes(grade)) throw new Error('Invalid review grade');
      this.transact(s => { const c = s.cards.find(c => c.id === id); if (!c || c.suspended || c.archived || c.due > this.now()) throw new Error('This card is not due.');
        const interval = grade === 'again' ? 0 : grade === 'hard' ? Math.max(1, c.interval * 1.2) : grade === 'good' ? Math.max(2, c.interval * 2) : Math.max(4, c.interval * 3);
        c.interval = Math.min(365, Math.round(interval)); c.due = this.now() + (grade === 'again' ? 600000 : c.interval * 86400000); c.reviews++; if (grade === 'again') c.lapses++;
      });
    }
    addStep(id, topic, due = '') { if (!this.known(topic)) throw new Error('Choose a lab'); this.transact(s => { const p = s.plans.find(p => p.id === id); if (!p) throw new Error('Plan not found'); if (p.steps.length >= 100) throw new Error('Plan limit reached'); p.steps.push({ id: uid(), topic, status: 'todo', due: day(due) }); }); }
    step(id, stepId, action, value) { this.transact(s => { const p = s.plans.find(p => p.id === id); const i = p?.steps.findIndex(t => t.id === stepId); if (!p || i < 0) return;
      if (action === 'remove') p.steps.splice(i, 1);
      else if (action === 'move') { const j = i + Number(value); if (j >= 0 && j < p.steps.length) [p.steps[i], p.steps[j]] = [p.steps[j], p.steps[i]]; }
      else if (action === 'status') p.steps[i].status = choice(value, ['todo', 'doing', 'done']);
      else if (action === 'due') p.steps[i].due = day(value);
    }); }
    startExam({ count = 10, topic = '', minutes = 0, questions } = {}) {
      this.transact(s => { if (s.activeExam) throw new Error('Finish or abandon the current exam first.');
        const ids = questions || this.quizzes.filter(q => !topic || q.topic === topic).map(q => q.id);
        // Fisher-Yates keeps each remaining question equally likely.
        const order = [...new Set(ids.filter(id => this.quizzes.some(q => q.id === id)))];
        for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        if (!order.length) throw new Error('No questions available for this topic.');
        s.activeExam = { id: uid(), questions: order.slice(0, Math.floor(num(count, 1, 50, 10))), answers: {}, flagged: [], index: 0, started: this.now(), deadline: minutes > 0 ? this.now() + num(minutes, 1, 120) * 60000 : 0, finished: 0 };
      });
    }
    examAction(action, value) {
      this.transact(s => { const e = s.activeExam; if (!e) return;
        if (e.deadline && this.now() >= e.deadline) { e.finished = this.now(); e.reason = 'timeout'; s.exams.unshift(e); s.activeExam = null; return; }
        const id = e.questions[e.index];
        if (action === 'answer') { const q = this.quizzes.find(q => q.id === id); if (Number.isInteger(value) && value >= 0 && value < q.options.length) e.answers[id] = value; }
        else if (action === 'flag') e.flagged = e.flagged.includes(id) ? e.flagged.filter(x => x !== id) : [...e.flagged, id];
        else if (action === 'navigate') e.index = Math.floor(num(value, 0, e.questions.length - 1));
        else if (action === 'submit' || action === 'abandon') { e.finished = this.now(); e.reason = action === 'submit' ? 'submitted' : 'abandoned'; s.exams.unshift(e); s.activeExam = null; }
      });
    }
    score(e) { const correct = e.questions.filter(id => e.answers[id] === this.quizzes.find(q => q.id === id)?.answer).length; return { correct, total: e.questions.length, percent: Math.round(correct / e.questions.length * 100), wrong: e.questions.filter(id => e.answers[id] !== this.quizzes.find(q => q.id === id)?.answer) }; }
    bookmark(topic) { if (this.known(topic)) this.transact(s => { s.bookmarks = s.bookmarks.includes(topic) ? s.bookmarks.filter(t => t !== topic) : [...s.bookmarks, topic]; }); }
    settings(patch) { this.transact(s => { if (patch.retention && patch.retention < s.runs.filter(r => r.pinned).length) throw new Error('Unpin some evidence before lowering retention.'); s.settings = { ...s.settings, ...patch }; }); }
    analytics() {
      const runs = this.state.runs;
      return { runs: runs.length, time: runs.reduce((n, r) => n + r.duration, 0), topics: new Set(runs.map(r => r.topic)).size, due: this.dueCards().length,
        perTopic: Object.keys(this.topics).map(topic => { const rr = runs.filter(r => r.topic === topic); return { topic, count: rr.length, average: rr.length ? Math.round(rr.reduce((n, r) => n + r.duration, 0) / rr.length) : 0, best: rr.length ? Math.min(...rr.map(r => r.duration)) : 0 }; }).filter(t => t.count),
        reviews: this.state.cards.reduce((n, c) => n + c.reviews, 0), lapses: this.state.cards.reduce((n, c) => n + c.lapses, 0) };
    }
    export(kind = 'all', format = 'json') {
      const rows = kind === 'all' ? this.state : this.state[kind];
      if (!rows) throw new Error('Unknown export');
      if (format === 'csv' && kind === 'runs') return csv([['Topic', 'Label', 'Date', 'Duration ms', 'Parameters'], ...rows.map(r => [this.title(r.topic), r.label, new Date(r.at).toISOString(), r.duration, JSON.stringify(r.params)])]);
      if (format === 'md' && Array.isArray(rows)) return rows.map(r => `# ${r.title || 'Practice exam'}\n\n${r.topic ? `Lab: ${this.title(r.topic)}\n\n` : ''}${r.body || r.back || r.description || ''}${kind === 'decisions' ? `\n\nStatus: ${r.status}\n\n## Context\n${r.context}\n\n## Alternatives\n${r.options}\n\n## Decision\n${r.outcome}\n\n## Consequences\n${r.consequences}` : ''}${kind === 'plans' ? '\n\n' + r.steps.map(s => `- [${s.status === 'done' ? 'x' : ' '}] ${this.title(s.topic)} ${s.due || ''}`).join('\n') : ''}`).join('\n\n---\n\n');
      return JSON.stringify({ app: 'backend-lab-studio', version: 1, exportedAt: this.now(), kind, data: rows });
    }
    previewImport(text) {
      if (typeof text !== 'string' || new Blob([text]).size > 4000000) throw new Error('Backup must be at most 4 MB.');
      let p; try { p = JSON.parse(text); } catch { throw new Error('Backup is not valid JSON.'); }
      if (!object(p) || p.app !== 'backend-lab-studio' || p.version !== 1 || !['all', ...kinds, 'runs', 'exams'].includes(p.kind)) throw new Error('Unsupported backup format or version.');
      if (p.kind === 'all' ? !object(p.data) : !Array.isArray(p.data)) throw new Error('Invalid backup data.');
      const normalized = this.normalize(p.kind === 'all' ? p.data : { [p.kind]: p.data });
      return { kind: p.kind, data: normalized, counts: Object.fromEntries([...kinds, 'runs', 'exams'].map(k => [k, normalized[k].length])) };
    }
    import(preview, mode = 'merge') {
      if (!['merge', 'replace'].includes(mode)) throw new Error('Invalid import mode');
      // Validate again; caller-supplied previews never bypass the schema.
      const clean = this.normalize(preview.data);
      this.transact(s => {
        const selected = preview.kind === 'all' ? [...kinds, 'runs', 'exams'] : [preview.kind];
        if (!selected.every(k => [...kinds, 'runs', 'exams'].includes(k))) throw new Error('Invalid collection');
        for (const k of selected) s[k] = mode === 'replace' ? clean[k] : [...s[k], ...clean[k].filter(e => !s[k].some(old => old.id === e.id))];
        if (preview.kind === 'all' && mode === 'replace') { s.settings = clean.settings; s.bookmarks = clean.bookmarks; s.activeExam = clean.activeExam; s.baseline = clean.baseline; }
        else if (preview.kind === 'all') s.bookmarks = [...new Set([...s.bookmarks, ...clean.bookmarks])];
      });
    }
    reset() { this.transact(s => { Object.assign(s, this.normalize({})); }); }
  }
  globalThis.StudyStore = StudyStore;
  globalThis.STUDIO_STORAGE_KEY = KEY;
})();
