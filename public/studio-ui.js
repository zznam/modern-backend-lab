/* DOM controller: every imported/user-authored value is rendered as text. */
(() => {
  let storage; try { storage = localStorage; } catch { /* Session-only fallback. */ }
  const store = new StudyStore({ topics: STUDIO_TOPICS, quizzes: QUEST_QUIZZES, storage });
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const names = { overview: 'Overview', runs: 'Experiment history', scenarios: 'Saved scenarios', notes: 'Research notebook', cards: 'Flashcards', plans: 'Learning plans', exams: 'Practice exams', library: 'Reference library', snippets: 'Code shelf', decisions: 'Decision records', insights: 'Insights', settings: 'Settings & backup' };
  const editable = ['scenarios', 'notes', 'cards', 'plans', 'snippets', 'decisions'];
  let view = 'overview', filters = {}, review = null, revealed = false, preview = null;
  const button = (action, label, id = '', extra = '') => `<button type="button" data-action="${action}" data-id="${esc(id)}" ${extra}>${esc(label)}</button>`;
  const option = (value, label, selected) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`;
  const topics = (selected = '', empty = 'All labs') => option('', empty, selected) + Object.entries(STUDIO_TOPICS).map(([k, t]) => option(k, t.title, selected)).join('');
  const labLink = (key, label = 'Open lab ↗') => `<a href="/#${encodeURIComponent(key)}">${esc(label)}</a>`;
  const date = n => new Date(n).toLocaleString();
  const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const overdue = (due, done = false) => due && due < localDay() && !done;
  const message = text => { $('#studio-message').textContent = text; };
  const field = (name, label, value = '', type = 'text', extra = '') => { const max = { back: 4000, prediction: 2000, context: 4000, options: 4000, outcome: 4000, consequences: 4000, description: 2000, deck: 80, tags: 329 }[name] || (type === 'textarea' ? 12000 : 200); return `<label ${type === 'textarea' ? 'class="full"' : ''}>${esc(label)}${type === 'textarea' ? `<textarea name="${name}" maxlength="${max}" ${extra}>${esc(value)}</textarea>` : `<input name="${name}" type="${type}" value="${esc(value)}" maxlength="${max}" ${extra}>`}</label>`; };
  const empty = (title, detail) => `<div class="empty"><h2>${esc(title)}</h2><p>${esc(detail)}</p></div>`;
  function download(text, name, type = 'application/json') { const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function labelSelects() { document.querySelectorAll('label > select').forEach(select => { select.setAttribute('aria-label', [...select.parentElement.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join('').trim()); }); }
  function dialog(title, body) { $('#dialog-title').textContent = title; $('#dialog-content').innerHTML = body; $('#dialog-error').textContent = ''; labelSelects(); if (!$('#studio-dialog').open) $('#studio-dialog').showModal(); }
  function applySettings() { const s = store.state.settings; for (const key of ['theme', 'density', 'text', 'motion']) document.documentElement.dataset[key] = s[key]; $('#storage-warning').textContent = store.storageError; }
  function toolbar() {
    if (![...editable, 'runs', 'library'].includes(view)) return '';
    return `<form class="toolbar" id="filter-form"><label>Search<input type="search" name="search" id="workspace-search" value="${esc(filters.search || '')}" placeholder="Search this collection"></label><label>Lab<select name="topic">${topics(filters.topic)}</select></label><label>Show<select name="status">${[['active','Active'],['all','Everything'],['pinned','Pinned'],['archived','Archived']].filter(([k]) => view === 'library' ? ['all','pinned'].includes(k) : view !== 'runs' || k !== 'archived').map(([k,l]) => option(k,l,filters.status || 'active')).join('')}</select></label><label>Sort<select name="sort">${[['newest','Newest'],['oldest','Oldest'],['title','Title'],...(view === 'runs' ? [['duration','Slowest']] : [])].map(([k,l]) => option(k,l,filters.sort || 'newest')).join('')}</select></label>${editable.includes(view) ? `<label>Tag<input name="tag" value="${esc(filters.tag || '')}" placeholder="Exact tag"></label>` : ''}${view === 'snippets' ? `<label>Language<select name="language">${['','text','javascript','typescript','sql','go','bash','json'].map(v => option(v,v || 'All languages',filters.language)).join('')}</select></label>` : ''}${view === 'cards' ? `<label>Deck<select name="deck">${option('','All decks',filters.deck)}${[...new Set(store.state.cards.map(c=>c.deck))].map(v=>option(v,v,filters.deck)).join('')}</select></label>` : ''}${view === 'library' ? `<label>Level<select name="level">${['','foundation','intermediate','advanced'].map(v=>option(v,v || 'All levels',filters.level)).join('')}</select></label>` : ''}<button type="submit">Apply</button>${button('clear-filters','Clear')}</form>`;
  }
  function render() {
    applySettings();
    $('#studio-title').textContent = names[view]; document.title = `${names[view]} · Study studio`;
    $('#studio-nav').innerHTML = Object.entries(names).map(([id, label]) => `<a href="#${id}" ${view === id ? 'aria-current="page"' : ''}>${label}</a>`).join('');
    $('#studio-actions').innerHTML = `${editable.includes(view) ? button('new','Create new','', 'class="primary"') : ''}${[...editable,'runs','exams'].includes(view) ? button('export','Export JSON') : ''}${['notes','plans','decisions','snippets'].includes(view) ? button('markdown','Export Markdown') : ''}${view === 'runs' ? button('csv','Export CSV') : ''}${['scenarios','cards'].includes(view) ? button('import','Import') : ''}${view === 'cards' ? button('review','Review due cards','', 'class="primary"') : ''}`;
    $('#studio-filters').innerHTML = toolbar();
    const renderers = { overview: overviewView, runs: runsView, library: libraryView, exams: examsView, insights: insightsView, settings: settingsView };
    $('#studio-content').innerHTML = renderers[view] ? renderers[view]() : collectionView();
    labelSelects();
  }
  function overviewView() {
    const a = store.analytics(), plan = store.state.plans.find(p=>!p.archived && p.steps.some(s=>s.status!=='done'));
    return `<section class="hero"><p class="eyebrow">Observe. Explain. Remember.</p><h2>Turn your experiments into lasting knowledge.</h2><p>Keep the evidence from a lab, write down your reasoning, and come back to test what you remember. This workspace belongs to you.</p><div class="actions"><a href="/">Run an experiment ↗</a><a href="#cards">Review ${a.due} due cards →</a><a href="#plans">Build a learning plan →</a></div></section><div class="grid">${[[a.runs,'Saved experiments'],[a.topics,'Labs with evidence'],[store.state.notes.length,'Research notes'],[a.due,'Cards due']].map(([n,l])=>`<article class="card"><span class="stat">${n}</span><p>${l}</p></article>`).join('')}</div><div class="grid" style="margin-top:1rem"><article class="card"><h2>Continue your work</h2>${plan ? `<p>${esc(plan.title)}</p>${labLink(plan.steps.find(s=>s.status!=='done').topic, 'Next planned lab ↗')}` : '<p>Create a plan with ordered labs and dates to see your next action here.</p>'}${store.state.activeExam ? '<p><a href="#exams">Resume your practice exam →</a></p>' : ''}</article><article class="card"><h2>Recent evidence</h2>${store.state.runs.slice(0,3).map(r=>`<p>${esc(store.title(r.topic))} <small>${esc(date(r.at))}</small></p>`).join('') || '<p>Successful lab results appear here automatically while history capture is enabled.</p>'}<a href="#runs">Explore your history →</a></article></div>`;
  }
  function runsView() {
    const rows = store.query('runs', filters);
    return `<p class="muted">${rows.length} saved runs. History retains up to ${store.state.settings.retention} runs, including pinned evidence. Result bodies are limited to 24 KB each. Durations depend on your machine.</p>${rows.map(r=>`<article class="card"><div class="card-meta"><span>${esc(date(r.at))} · ${r.duration} ms</span><span>${r.pinned?'Pinned · ':''}${store.state.baseline===r.id?'Comparison baseline':''}</span></div><h2>${esc(r.label || r.title)}</h2><p>${esc(store.title(r.topic))}</p><pre>${esc(JSON.stringify(r.params))}</pre><div class="actions">${button('inspect-run','Inspect result',r.id)}${button('label-run','Label',r.id)}${button('pin','Pin',r.id,`aria-pressed="${r.pinned}"`)}${button('baseline','Set baseline',r.id)}${button('compare','Compare',r.id)}${button('run-scenario','Save scenario',r.id)}${button('run-note','Write evidence note',r.id)}${button('replay-run','Load settings in lab',r.id)}${button('delete','Delete',r.id,'class="danger"')}</div></article>`).join('') || empty('No saved experiments','Run a lab successfully, or clear your filters.')}`;
  }
  function collectionView() {
    const rows = store.query(view, filters);
    if (view === 'cards' && review) return reviewView();
    return `${view === 'cards' ? `<p class="muted">${store.dueCards(filters.deck).length} due · ${store.analytics().reviews} reviews · ${store.analytics().lapses} lapses. Review intervals are a simple practice aid.</p>` : ''}<p class="muted">${rows.length} ${rows.length === 1 ? 'record' : 'records'}</p><div class="grid">${rows.map(e=>recordCard(e)).join('') || empty('Start a new collection','Create your first record, or clear the filters.')}</div>`;
  }
  function recordCard(e) {
    let body = '';
    if (view === 'notes') body = `<p class="prose">${esc(e.body.slice(0,400))}${e.body.length>400?'…':''}</p>${e.runId ? '<span class="pill">Linked experiment evidence</span>' : ''}`;
    if (view === 'snippets') body = `<span class="pill">${esc(e.language)}</span><p>${esc(e.description)}</p><pre><code>${esc(e.body)}</code></pre>`;
    if (view === 'cards') body = `<span class="pill">${esc(e.deck)}</span><p>${e.suspended ? 'Suspended' : `Due ${esc(date(e.due))}`} · ${e.reviews} reviews</p>`;
    if (view === 'scenarios') body = `<pre>${esc(JSON.stringify(e.params,null,2))}</pre><p>${esc(e.prediction)}</p>`;
    if (view === 'decisions') body = `<span class="pill">${esc(e.status)}</span><p>${esc(e.context.slice(0,250))}</p><p>${esc(e.outcome.slice(0,250))}</p>${e.supersedes ? '<span class="pill">Revises an earlier decision</span>' : ''}`;
    if (view === 'plans') {
      const done = e.steps.filter(s=>s.status==='done').length, next = e.steps.find(s=>s.status!=='done');
      body = `<p>${esc(e.description)}</p><p class="${overdue(e.due,done===e.steps.length)?'overdue':''}">${e.due ? `Due ${esc(e.due)} · ` : ''}${done} / ${e.steps.length} complete</p><progress value="${done}" max="${e.steps.length||1}" aria-label="Plan progress"></progress>${next ? `<p>${labLink(next.topic,'Next: '+store.title(next.topic))}</p>` : ''}`;
    }
    const actions = [button('edit','Edit',e.id), button('view','Read',e.id), button('pin',e.pinned?'Unpin':'Pin',e.id,`aria-pressed="${e.pinned}"`), button('archive',e.archived?'Restore':'Archive',e.id), button('duplicate','Duplicate',e.id)];
    if (view === 'notes') actions.push(button('note-card','Make flashcard',e.id));
    if (view === 'snippets') actions.push(button('copy-snippet','Copy code',e.id),button('download-snippet','Download code',e.id));
    if (view === 'cards') actions.push(button('suspend',e.suspended?'Resume reviews':'Suspend',e.id));
    if (view === 'scenarios') actions.push(button('apply-scenario','Load in lab',e.id));
    if (view === 'plans') actions.push(button('plan-steps','Manage steps',e.id));
    if (view === 'decisions') actions.push(button('supersede','Revise decision',e.id));
    actions.push(button('delete','Delete',e.id,'class="danger"'));
    return `<article class="card"><div class="card-meta"><span>${e.topic ? esc(store.title(e.topic)) : 'Personal workspace'}</span><span>${e.pinned?'Pinned ':''}${e.archived?'Archived':''}</span></div><h2>${esc(e.title)}</h2>${body}<div>${e.tags.map(t=>`<span class="pill">${esc(t)}</span>`).join('')}</div><div class="actions">${actions.join('')}${e.topic?labLink(e.topic):''}</div></article>`;
  }
  function editor(kind, record = {}) {
    const e = record; let body = '';
    if (kind === 'notes') body = field('body','Research note',e.body,'textarea');
    if (kind === 'snippets') body = `<label>Language<select name="language">${['text','javascript','typescript','sql','go','bash','json'].map(v=>option(v,v,e.language)).join('')}</select></label>${field('description','Purpose',e.description)}${field('body','Code (stored as text; never executed)',e.body,'textarea')}`;
    if (kind === 'cards') body = field('deck','Deck',e.deck || 'General') + field('back','Answer',e.back,'textarea','required');
    if (kind === 'scenarios') body = field('params','Numeric parameters (JSON)',JSON.stringify(e.params || {},null,2),'textarea','required') + field('prediction','Expected outcome',e.prediction,'textarea');
    if (kind === 'plans') body = field('description','Goal',e.description,'textarea') + field('due','Target date',e.due,'date');
    if (kind === 'decisions') body = `<label>Status<select name="status">${['proposed','accepted','rejected','superseded'].map(v=>option(v,v,e.status)).join('')}</select></label><label>Evidence run<select name="runId">${option('','No linked run',e.runId)}${store.state.runs.map(r=>option(r.id,`${r.label || r.title} · ${date(r.at)}`,e.runId)).join('')}</select></label>${field('context','Problem and constraints',e.context,'textarea')}${field('options','Alternatives and tradeoffs',e.options,'textarea')}${field('outcome','Decision',e.outcome,'textarea')}${field('consequences','Consequences and follow-up',e.consequences,'textarea')}`;
    dialog(`${e.id?'Edit':'Create'} ${names[kind].toLowerCase()}`, `<form data-form="record" data-kind="${kind}" data-id="${esc(e.id || '')}" data-supersedes="${esc(e.supersedes || '')}" data-run="${esc(e.runId || '')}" class="form-grid">${field('title',kind==='cards'?'Question':'Title',e.title,'text','required')}<label>Linked lab<select name="topic" ${kind==='scenarios'?'required':''}>${topics(e.topic,'No linked lab')}</select></label>${field('tags','Tags (comma separated)',(e.tags || []).join(', '))}${body}<div class="actions full"><button class="primary" type="submit">Save record</button>${button('close','Cancel')}</div></form>`);
  }
  function readRecord(e) {
    let text = e.body || e.back || e.description || e.prediction || '';
    if (view === 'decisions') text = `Status: ${e.status}\n\nContext\n${e.context}\n\nAlternatives\n${e.options}\n\nDecision\n${e.outcome}\n\nConsequences\n${e.consequences}`;
    const run = store.state.runs.find(r=>r.id===e.runId);
    dialog(e.title,`<p class="prose">${esc(text)}</p>${e.topic?labLink(e.topic):''}${e.params?`<pre>${esc(JSON.stringify(e.params,null,2))}</pre>`:''}${run?`<h3>Linked evidence</h3><pre>${esc(JSON.stringify(run.result,null,2))}</pre>`:e.runId?'<p class="muted">The linked run is no longer in retained history.</p>':''}`);
  }
  function planDialog(id) {
    const p = store.state.plans.find(p=>p.id===id); if (!p) return;
    dialog(p.title,`<form data-form="step" data-id="${esc(id)}" class="form-grid"><label>Lab to add<select name="topic" required>${topics('','Choose a lab')}</select></label>${field('due','Step due date','','date')}<button type="submit">Add step</button></form><ol class="steps">${p.steps.map((s,i)=>`<li><strong>${esc(store.title(s.topic))}</strong>${overdue(s.due,s.status==='done')?'<span class="pill overdue">Overdue</span>':''}<div class="actions"><label>Status<select data-step-field="status" data-plan="${esc(id)}" data-step="${esc(s.id)}">${['todo','doing','done'].map(v=>option(v,v,s.status)).join('')}</select></label><label>Due<input type="date" value="${esc(s.due)}" data-step-field="due" data-plan="${esc(id)}" data-step="${esc(s.id)}"></label>${button('step-up','Move up',s.id,`data-plan="${esc(id)}" ${i===0?'disabled':''}`)}${button('step-down','Move down',s.id,`data-plan="${esc(id)}" ${i===p.steps.length-1?'disabled':''}`)}${button('step-remove','Remove step',s.id,`data-plan="${esc(id)}"`)}${labLink(s.topic)}</div></li>`).join('')}</ol>`);
  }
  function reviewView() {
    const card = store.state.cards.find(c=>c.id===review);
    if (!card) { review = null; return collectionView(); }
    return `<article class="card review"><p class="eyebrow">${esc(card.deck)} · ${store.dueCards(filters.deck).length} due</p><h2>${esc(card.title)}</h2>${revealed ? `<p class="prose">${esc(card.back)}</p><p>How well did you recall this?</p><div class="actions">${['again','hard','good','easy'].map(g=>button('grade',`${g[0].toUpperCase()+g.slice(1)}${g==='again'?' · 10 min':''}`,g)).join('')}</div>` : button('reveal','Reveal answer','','class="primary"')}<div class="actions">${button('end-review','End review')}${card.topic?labLink(card.topic):''}</div></article>`;
  }
  function libraryView() {
    let rows = Object.entries(STUDIO_TOPICS).filter(([k,t])=>(!filters.topic||k===filters.topic)&&(!filters.level||t.level===filters.level)&&(filters.status!=='pinned'||store.state.bookmarks.includes(k))&&`${t.title} ${t.objective} ${t.mechanics} ${t.production}`.toLowerCase().includes((filters.search||'').toLowerCase()));
    if (filters.sort==='title') rows.sort((a,b)=>a[1].title.localeCompare(b[1].title));
    return `<p class="muted">${rows.length} concept guides from the existing curriculum. Pin references you return to often.</p><div class="grid">${rows.map(([key,t])=>`<article class="card"><p class="eyebrow">${esc(t.level)}</p><h2>${esc(t.title)}</h2><p>${esc(t.objective)}</p><details><summary>Mechanics & production considerations</summary><p>${esc(t.mechanics)}</p><p>${esc(t.production)}</p>${t.prerequisites.length?`<p>Builds on: ${t.prerequisites.map(p=>labLink(p,store.title(p))).join(', ')}</p>`:''}${t.reference?`<p><a href="${esc(t.reference[1])}" target="_blank" rel="noopener noreferrer">${esc(t.reference[0])} ↗</a></p>`:''}</details><div class="actions">${labLink(key)}${button('bookmark',store.state.bookmarks.includes(key)?'Unpin reference':'Pin reference',key,`aria-pressed="${store.state.bookmarks.includes(key)}"`)}${button('library-card','Create recall card',key)}${button('library-note','Start research note',key)}</div></article>`).join('') || empty('No matching references','Clear filters or try another concept.')}</div>`;
  }
  function examsView() {
    const e = store.state.activeExam;
    if (e) {
      const id = e.questions[e.index], q = QUEST_QUIZZES.find(q=>q.id===id);
      return `<article class="card review"><div class="card-meta"><span>Question ${e.index+1} / ${e.questions.length} · ${Object.keys(e.answers).length} answered</span><span id="exam-clock">${e.deadline?'Timed exam':'Untimed'}</span></div><h2 tabindex="-1" id="exam-question">${esc(q.question)}</h2><div class="answer-options">${q.options.map((o,i)=>button('answer',o,String(i),`aria-pressed="${e.answers[id]===i}"`)).join('')}</div><div class="actions">${button('exam-nav','Previous',String(e.index-1),e.index===0?'disabled':'')}${button('flag',e.flagged.includes(id)?'Unflag question':'Flag for review',id,`aria-pressed="${e.flagged.includes(id)}"`)}${button('exam-nav','Next',String(e.index+1),e.index===e.questions.length-1?'disabled':'')}</div><nav class="question-nav" aria-label="Exam questions">${e.questions.map((id,i)=>button('exam-nav',`${i+1}${e.flagged.includes(id)?' ⚑':''}`,String(i),`aria-label="Question ${i+1}${Object.hasOwn(e.answers,id)?', answered':''}${e.flagged.includes(id)?', flagged':''}" class="${Object.hasOwn(e.answers,id)?'answered':''}" ${i===e.index?'aria-current="step"':''}`)).join('')}</nav><div class="actions">${button('submit-exam','Submit exam','','class="primary"')}${button('abandon-exam','Abandon exam','','class="danger"')}</div><p class="muted">Answers are saved locally. Closing the page does not stop a timed exam.</p></article>`;
    }
    return `<article class="card"><h2>Test your understanding</h2><p>Build a practice exam from ${QUEST_QUIZZES.length} existing knowledge checks. Scores are for self-study.</p><form data-form="exam" class="form-grid"><label>Question pool<select name="topic">${option('','All questions','')}${[...new Set(QUEST_QUIZZES.map(q=>q.topic))].map(k=>option(k,store.title(k),'')).join('')}</select></label><label>Questions<select name="count">${[5,10,20,50].map(n=>option(String(n),`Up to ${n}`, '10')).join('')}</select></label><label>Time limit<select name="minutes">${[[0,'Untimed'],[5,'5 minutes'],[10,'10 minutes'],[20,'20 minutes']].map(([n,l])=>option(String(n),l,'0')).join('')}</select></label><div class="actions"><button type="submit" class="primary">Start exam</button></div></form></article><h2>Exam history</h2>${store.state.exams.map(e=>{const s=store.score(e);return `<article class="card"><div class="card-meta">${esc(date(e.finished))} · ${esc(e.reason)}</div><h3>${s.correct} / ${s.total} correct · ${s.percent}%</h3><div class="actions">${button('exam-report','Review answers',e.id)}${button('retry-wrong','Retry missed questions',e.id,s.wrong.length?'':'disabled')}${button('exam-download','Download report',e.id)}</div></article>`;}).join('') || empty('Your first exam is ahead','Your completed, timed-out, and abandoned attempts will appear here.')}`;
  }
  function examReport(id) {
    const e = store.state.exams.find(e=>e.id===id); if (!e) return;
    const score = store.score(e);
    dialog(`Exam review · ${score.correct} / ${score.total}`, e.questions.map(id=>{const q=QUEST_QUIZZES.find(q=>q.id===id);return `<article class="card ${e.answers[id]===q.answer?'result-correct':'result-wrong'}"><h3>${esc(q.question)}</h3><p>Your answer: ${esc(q.options[e.answers[id]] || 'Not answered')}</p><p>Correct answer: ${esc(q.options[q.answer])}</p><p>${esc(q.explanation)}</p>${labLink(q.topic,'Revisit this lab ↗')}</article>`;}).join(''));
  }
  function insightsView() {
    const a=store.analytics(), plans=store.state.plans.filter(p=>!p.archived), exams=store.state.exams.filter(e=>e.reason!=='abandoned');
    return `<p class="muted">Metrics reflect retained local evidence. Deleting history changes these totals. Execution time is server-reported, not study time.</p><div class="grid">${[[a.runs,'Retained runs'],[`${(a.time/1000).toFixed(2)} s`,'Total execution time'],[a.topics,'Distinct labs'],[a.due,'Due cards'],[a.reviews,'Flashcard reviews'],[exams.length?`${Math.round(exams.reduce((n,e)=>n+store.score(e).percent,0)/exams.length)}%`:'—','Average exam score']].map(([n,l])=>`<article class="card"><span class="stat">${n}</span><p>${l}</p></article>`).join('')}</div><article class="card" style="margin-top:1rem"><h2>Experiment coverage & duration</h2><div class="table-wrap"><table><thead><tr><th>Lab</th><th>Runs</th><th>Average ms</th><th>Fastest ms</th></tr></thead><tbody>${a.perTopic.map(t=>`<tr><td>${labLink(t.topic,store.title(t.topic))}</td><td>${t.count}</td><td>${t.average}</td><td>${t.best}</td></tr>`).join('')}</tbody></table></div></article><article class="card"><h2>Upcoming plan work</h2>${plans.flatMap(p=>p.steps.filter(s=>s.status!=='done').map(s=>`<p class="${overdue(s.due)?'overdue':''}">${esc(p.title)} · ${labLink(s.topic,store.title(s.topic))} · ${esc(s.due || 'Unscheduled')}${overdue(s.due)?' · Overdue':''}</p>`)).join('') || '<p>No open steps. Add a learning plan to organize your next labs.</p>'}</article><article class="card"><h2>Deck health</h2>${[...new Set(store.state.cards.map(c=>c.deck))].map(d=>{const cc=store.state.cards.filter(c=>c.deck===d);return `<p>${esc(d)} · ${cc.length} cards · ${store.dueCards(d).length} due · ${cc.filter(c=>c.suspended).length} suspended</p>`;}).join('') || '<p>Create cards to see your deck summary.</p>'}</article>`;
  }
  function settingsView() {
    const s = store.state.settings;
    const select = (key,label,values) => `<label>${label}<select name="${key}">${values.map(([v,l])=>option(String(v),l,String(s[key]))).join('')}</select></label>`;
    return `<div class="settings-grid"><article class="card"><h2>Make this space yours</h2><form data-form="settings" class="form-grid">${select('theme','Theme',[['system','Follow system'],['dark','Dark'],['light','Light']])}${select('density','Card spacing',[['comfortable','Comfortable'],['compact','Compact']])}${select('text','Text size',[['normal','Standard'],['large','Large']])}${select('motion','Motion preference',[['system','Follow system'],['reduce','Reduce motion']])}${select('capture','Save successful experiment results',[[true,'Enabled'],[false,'Disabled']])}${select('retention','History retention (pins count toward limit)',[[25,'25 runs'],[50,'50 runs'],[100,'100 runs']])}<div class="full"><button type="submit" class="primary">Save preferences</button></div></form></article><article class="card"><h2>Backup & restore</h2><p>Backups contain private notes, code, saved results, and answers. Imports are previewed before applying. Merge keeps existing records with matching IDs; replace replaces only the imported collection, or the whole studio for a full backup.</p><div class="actions">${button('backup','Download full backup')}${button('import','Import backup')}</div><p>${new Blob([JSON.stringify(store.state)]).size.toLocaleString()} bytes of studio data · ${store.storageError?'Session only':'Browser storage available'}</p></article><article class="card"><h2>Keyboard shortcuts</h2><p><kbd>/</kbd> focuses collection search. <kbd>Alt</kbd> + <kbd>N</kbd> creates a record. <kbd>Esc</kbd> closes a dialog.</p></article><article class="card"><h2>Reset study studio</h2><p>Clears studio records and preferences on this browser. Original lab and quest progress are separate.</p>${button('reset','Reset studio…','','class="danger"')}</article></div>`;
  }
  function showImport() { preview=null; dialog('Import workspace data', '<form data-form="import" class="stack"><label>JSON backup file<input type="file" name="file" accept="application/json,.json" required></label><button type="submit">Preview import</button></form>'); }
  function applyScenario(e) {
    try { if (!storage) throw new Error(); storage.setItem('backend-lab-pending-scenario', JSON.stringify({ topic:e.topic, params:e.params })); }
    catch { throw new Error('Browser storage is required to transfer settings to the lab. Enable storage or copy the parameters manually.'); }
    location.href=`/#${encodeURIComponent(e.topic)}`;
  }
  async function act(action,id,el) {
    const e = store.state[view]?.find?.(e=>e.id===id);
    if (action==='close') { $('#studio-dialog').close(); return; }
    if (action==='clear-filters') { filters={}; render(); return; }
    if (action==='new') { editor(view); return; }
    if (action==='edit') { editor(view,e); return; }
    if (action==='view') { readRecord(e); return; }
    if (action==='delete') { dialog('Delete this record?',`<p>This removes the record from this browser. Export a backup first if you want to keep a copy.</p><div class="actions">${button('confirm-delete','Delete record',id,'class="danger"')}${button('close','Keep record')}</div>`); return; }
    if (action==='confirm-delete') { store.remove(view,id); $('#studio-dialog').close(); message('Record deleted.'); }
    else if (action==='pin'||action==='archive'||action==='suspend') store.toggle(view,id,{pin:'pinned',archive:'archived',suspend:'suspended'}[action]);
    else if (action==='duplicate') { store.duplicate(view,id); message('Copy created.'); }
    else if (['export','markdown','csv','backup'].includes(action)) { const kind=action==='backup'?'all':view, format=action==='markdown'?'md':action==='csv'?'csv':'json'; download(store.export(kind,format),`backend-lab-${kind}.${format}`,format==='json'?'application/json':'text/plain'); message('Export downloaded.'); return; }
    else if (action==='import') { showImport(); return; }
    else if (action==='import-merge'||action==='import-replace') { if (!preview) return; store.import(preview,action==='import-merge'?'merge':'replace'); preview=null; $('#studio-dialog').close(); message('Backup imported.'); }
    else if (action==='reset') { dialog('Reset all studio data?',`<p>This removes saved runs, notes, cards, plans, exams, scenarios, code, decisions, and settings. It cannot be undone without a backup.</p>${button('confirm-reset','Yes, reset study studio','','class="danger"')}${button('close','Keep my data')}`); return; }
    else if (action==='confirm-reset') { store.reset(); $('#studio-dialog').close(); message('Study studio reset.'); }
    else if (action==='inspect-run') { dialog(e.label||e.title,`<p>${esc(date(e.at))} · ${e.duration} ms</p><h3>Parameters</h3><pre>${esc(JSON.stringify(e.params,null,2))}</pre><h3>Result</h3><pre>${esc(JSON.stringify(e.result,null,2))}</pre>`); return; }
    else if (action==='label-run') { dialog('Label experiment',`<form data-form="run-label" data-id="${esc(id)}" class="stack">${field('label','Label',e.label)}<button type="submit">Save label</button></form>`); return; }
    else if (action==='baseline') { store.baseline(id); message('Baseline selected. Compare another run from the same lab.'); }
    else if (action==='compare') { const rows=store.compare(id); dialog('Run comparison',`<p>Delta is current minus baseline. Timing differences can include machine noise.</p><div class="table-wrap"><table><thead><tr><th>Setting / metric</th><th>Baseline</th><th>Current</th><th>Delta</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.key)}</td><td>${esc(r.before)}</td><td>${esc(r.after)}</td><td>${esc(r.delta)}</td></tr>`).join('')}</tbody></table></div>`); return; }
    else if (action==='run-scenario') { editor('scenarios',{title:e.label||e.title,topic:e.topic,params:e.params}); return; }
    else if (action==='run-note') { editor('notes',{title:e.label||e.title,topic:e.topic,runId:id,body:`Observation from ${date(e.at)}\n\nParameters: ${JSON.stringify(e.params)}\n\nWhat happened?\n\nWhy?\n\nWhat would I test next?`}); return; }
    else if (action==='apply-scenario'||action==='replay-run') { applyScenario(e); return; }
    else if (action==='note-card') { editor('cards',{title:e.title,topic:e.topic,back:e.body.slice(0,4000),tags:e.tags}); return; }
    else if (action==='copy-snippet') { try { await navigator.clipboard.writeText(e.body); message('Code copied.'); } catch { message('Clipboard unavailable. Open Read and select the code to copy it.'); } return; }
    else if (action==='download-snippet') { const ext={javascript:'js',typescript:'ts',sql:'sql',go:'go',bash:'sh',json:'json',text:'txt'}[e.language]; download(e.body,`snippet.${ext}`,'text/plain'); return; }
    else if (action==='plan-steps') { planDialog(id); return; }
    else if (action.startsWith('step-')) { const p=el.dataset.plan; store.step(p,id,action==='step-remove'?'remove':'move',action==='step-up'?-1:1); render(); planDialog(p); return; }
    else if (action==='supersede') { editor('decisions',{...e,id:undefined,title:`Revision: ${e.title}`,status:'proposed',supersedes:e.id}); return; }
    else if (action==='review') { review=store.dueCards(filters.deck)[0]?.id || null; revealed=false; if (!review) message('No cards are due in this deck.'); }
    else if (action==='end-review') { review=null; revealed=false; }
    else if (action==='reveal') revealed=true;
    else if (action==='grade') { if (!revealed || !review) return; store.gradeCard(review,id); review=store.dueCards(filters.deck)[0]?.id||null; revealed=false; if (!review) message('Review complete. All due cards in this deck are scheduled.'); }
    else if (action==='bookmark') store.bookmark(id);
    else if (action==='library-card') { const t=STUDIO_TOPICS[id]; editor('cards',{title:`Explain ${t.title}`,topic:id,back:t.mechanics,deck:t.level}); return; }
    else if (action==='library-note') { const t=STUDIO_TOPICS[id]; editor('notes',{title:t.title,topic:id,body:`Learning objective\n${t.objective}\n\nMy explanation\n\nEvidence\n\nOpen questions`}); return; }
    else if (action==='answer') store.examAction('answer',Number(id));
    else if (action==='flag') store.examAction('flag');
    else if (action==='exam-nav') store.examAction('navigate',Number(id));
    else if (action==='submit-exam'||action==='abandon-exam') { const e=store.state.activeExam; dialog(action==='submit-exam'?'Submit this exam?':'Abandon this exam?',`<p>${e.questions.length-Object.keys(e.answers).length} questions are unanswered. ${action==='submit-exam'?'Unanswered questions count as incorrect.':'This attempt will be recorded as abandoned.'}</p>${button(action==='submit-exam'?'confirm-submit':'confirm-abandon','Confirm')}${button('close','Keep working')}`); return; }
    else if (action==='confirm-submit'||action==='confirm-abandon') { store.examAction(action==='confirm-submit'?'submit':'abandon'); $('#studio-dialog').close(); }
    else if (action==='exam-report') { examReport(id); return; }
    else if (action==='retry-wrong') { const e=store.state.exams.find(e=>e.id===id); const wrong=store.score(e).wrong; if (wrong.length) store.startExam({questions:wrong,count:wrong.length}); }
    else if (action==='exam-download') { const e=store.state.exams.find(e=>e.id===id); download(JSON.stringify({attempt:e,score:store.score(e),questions:e.questions.map(id=>QUEST_QUIZZES.find(q=>q.id===id))},null,2),'practice-exam-report.json'); return; }
    render();
    if (['answer','flag','exam-nav'].includes(action)) $('#exam-question')?.focus();
  }
  document.addEventListener('click', event => { if (event.target.closest('.skip')) { event.preventDefault(); $('#studio-main').focus(); return; } const el=event.target.closest('[data-action]'); if (!el) return; act(el.dataset.action,el.dataset.id,el).catch(error=>{ if ($('#studio-dialog').open) $('#dialog-error').textContent=error.message; else message(error.message); }); });
  document.addEventListener('submit', async event => {
    const form=event.target; event.preventDefault(); const data=Object.fromEntries(new FormData(form));
    try {
      if (form.id==='filter-form') { filters=data; render(); $('#workspace-search')?.focus(); return; }
      const type=form.dataset.form;
      if (type==='record') {
        const kind=form.dataset.kind;
        if (kind==='scenarios') { try { data.params=JSON.parse(data.params); } catch { throw new Error('Parameters must be valid JSON.'); } }
        data.tags=data.tags.split(',').map(t=>t.trim()).filter(Boolean); data.id=form.dataset.id||undefined;
        if (form.dataset.run && !data.runId) data.runId=form.dataset.run;
        if (form.dataset.supersedes) data.supersedes=form.dataset.supersedes;
        store.save(kind,data);
        $('#studio-dialog').close(); message(`Saved to ${names[kind].toLowerCase()}.`);
      } else if (type==='step') { store.addStep(form.dataset.id,data.topic,data.due); render(); planDialog(form.dataset.id); return; }
      else if (type==='run-label') { store.labelRun(form.dataset.id,data.label); $('#studio-dialog').close(); }
      else if (type==='exam') store.startExam({topic:data.topic,count:Number(data.count),minutes:Number(data.minutes)});
      else if (type==='settings') { store.settings({...data,capture:data.capture==='true',retention:Number(data.retention)}); message('Preferences saved.'); }
      else if (type==='import') {
        const file=form.querySelector('input[type=file]').files[0]; if (!file || file.size>4000000) throw new Error('Choose a JSON backup up to 4 MB.');
        preview=store.previewImport(await file.text());
        dialog('Review import',`<p>Collection: ${esc(preview.kind)}. Valid records found:</p><ul>${Object.entries(preview.counts).filter(([,n])=>n).map(([k,n])=>`<li>${esc(names[k]||k)}: ${n}</li>`).join('') || '<li>No records</li>'}</ul><p>Merge adds new IDs and keeps existing records. Replace removes current records in the imported collection. A full backup also replaces preferences and the active exam.</p><div class="actions">${button('import-merge','Merge records','','class="primary"')}${button('import-replace','Replace imported collection','','class="danger"')}${button('close','Cancel')}</div>`); return;
      }
      render();
    } catch(error) { if ($('#studio-dialog').open) $('#dialog-error').textContent=error.message; else message(error.message); }
  });
  document.addEventListener('change', event=>{const el=event.target; if (el.dataset.stepField) { store.step(el.dataset.plan,el.dataset.step,el.dataset.stepField,el.value); applySettings(); } });
  $('#studio-dialog').addEventListener('close',()=>{preview=null;render();});
  function route() { const hash=location.hash.slice(1); view=Object.hasOwn(names,hash)?hash:'overview'; filters={}; review=null; revealed=false; message(''); if ($('#studio-dialog').open) $('#studio-dialog').close(); render(); $('#studio-title').focus(); }
  window.addEventListener('hashchange',route);
  window.addEventListener('storage',event=>{if(event.key===STUDIO_STORAGE_KEY){store.state=store.read();if(!$('#studio-dialog').open) render();else message('Data changed in another tab. Saving keeps unrelated records.');}});
  document.addEventListener('keydown',event=>{const editing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);if(event.key==='/'&&!editing&&!$('#studio-dialog').open){event.preventDefault();$('#workspace-search')?.focus();}if(event.altKey&&event.key.toLowerCase()==='n'&&!editing&&editable.includes(view)&&!$('#studio-dialog').open){event.preventDefault();editor(view);}});
  setInterval(()=>{const e=store.state.activeExam;if(!e?.deadline)return;if(Date.now()>=e.deadline){store.examAction('tick');if($('#studio-dialog').open)$('#studio-dialog').close();render();message('Time is up. Your saved answers were submitted.');}else if($('#exam-clock'))$('#exam-clock').textContent=`${Math.ceil((e.deadline-Date.now())/1000)} seconds remaining`;},1000);
  route();
})();
