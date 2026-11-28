import { test, expect, runLab } from './fixtures.js';

const card = (page,title) => page.locator('#studio-content .card').filter({has:page.getByRole('heading',{name:title,exact:true})});
async function open(page,view) { await page.goto(`/studio.html#${view}`); await expect(page.locator('#studio-title')).toBeVisible(); }
async function create(page,title,fields={}) {
  await page.getByRole('button',{name:'Create new',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel('Title',{exact:true}).fill(title);
  for(const [label,value] of Object.entries(fields)) await dialog.getByLabel(label,{exact:true}).fill(value);
  await dialog.getByRole('button',{name:'Save record'}).click();await expect(dialog).not.toBeVisible();
}

test('captures real experiments, compares runs, saves and replays scenarios with evidence notes',async({page})=>{
  await page.goto('/#replication-quorums');await runLab(page,'replication-quorums');
  await page.locator('#param-readQuorum').fill('1');await page.locator('#param-writeQuorum').fill('1');await runLab(page,'replication-quorums');
  await page.getByRole('link',{name:'Study studio',exact:true}).click();await page.locator('#studio-nav').getByRole('link',{name:'Experiment history'}).click();
  const runs=page.locator('#studio-content .card');await expect(runs).toHaveCount(2);
  await runs.nth(1).getByRole('button',{name:'Set baseline',exact:true}).click();await runs.first().getByRole('button',{name:'Compare',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('readQuorum');await page.getByRole('button',{name:'Close dialog'}).click();
  await runs.first().getByRole('button',{name:'Write evidence note'}).click();await page.getByRole('dialog').getByLabel('Title',{exact:true}).fill('Stale read evidence');await page.getByRole('dialog').getByRole('button',{name:'Save record'}).click();
  await runs.first().getByRole('button',{name:'Save scenario',exact:true}).click();await page.getByRole('dialog').getByLabel('Title',{exact:true}).fill('My stale quorum');await page.getByRole('dialog').getByRole('button',{name:'Save record'}).click();
  await page.locator('#studio-nav').getByRole('link',{name:'Saved scenarios'}).click();await card(page,'My stale quorum').getByRole('button',{name:'Load in lab'}).click();
  await expect(page.locator('#param-readQuorum')).toHaveValue('1');await expect(page.locator('#param-writeQuorum')).toHaveValue('1');await expect(page.locator('#exec-status')).toHaveText('Idle (Ready)');
  await open(page,'notes');await card(page,'Stale read evidence').getByRole('button',{name:'Read',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Linked evidence');
});

test('writes notebook records, searches tags, pins, archives, restores, and makes scheduled cards',async({page})=>{
  await open(page,'notes');await create(page,'Cache observations',{'Research note':'One shared request protects the database.','Tags (comma separated)':'cache, evidence'});
  await card(page,'Cache observations').getByRole('button',{name:'Pin',exact:true}).click();
  await page.getByLabel('Show',{exact:true}).selectOption('pinned');await page.getByRole('button',{name:'Apply',exact:true}).click();await expect(card(page,'Cache observations')).toBeVisible();
  await card(page,'Cache observations').getByRole('button',{name:'Make flashcard'}).click();await page.getByRole('dialog').getByRole('button',{name:'Save record'}).click();
  await card(page,'Cache observations').getByRole('button',{name:'Archive',exact:true}).click();await page.getByLabel('Show',{exact:true}).selectOption('archived');await page.getByRole('button',{name:'Apply',exact:true}).click();await card(page,'Cache observations').getByRole('button',{name:'Restore',exact:true}).click();
  await open(page,'cards');await page.getByRole('button',{name:'Review due cards'}).click();await expect(page.locator('#studio-content')).not.toContainText('One shared request');await page.getByRole('button',{name:'Reveal answer'}).click();await expect(page.locator('#studio-content')).toContainText('One shared request');await page.getByRole('button',{name:'Good',exact:true}).click();
  await page.reload();await expect(page.locator('#studio-content')).toContainText('0 due');
});

test('builds ordered plans and revises architecture decisions with linked code',async({page})=>{
  await open(page,'plans');await create(page,'Reliability week',{'Goal':'Understand bounded demand','Target date':'2026-12-01'});
  await card(page,'Reliability week').getByRole('button',{name:'Manage steps'}).click();const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Lab to add').selectOption('event-loop');await dialog.getByRole('button',{name:'Add step'}).click();
  await dialog.getByLabel('Lab to add').selectOption('backpressure');await dialog.getByRole('button',{name:'Add step'}).click();
  await dialog.getByRole('button',{name:'Move up'}).nth(1).click();await dialog.getByLabel('Status',{exact:true}).first().selectOption('done');await page.getByRole('button',{name:'Close dialog'}).click();await expect(card(page,'Reliability week')).toContainText('1 / 2 complete');
  await open(page,'decisions');await create(page,'Queue policy',{'Problem and constraints':'A slow consumer grows memory.','Alternatives and tradeoffs':'Unbounded queue; bounded queue; rejection.','Decision':'Bound the queue.','Consequences and follow-up':'Measure rejected jobs.'});
  await card(page,'Queue policy').getByRole('button',{name:'Revise decision'}).click();await dialog.getByLabel('Status',{exact:true}).selectOption('accepted');await dialog.getByRole('button',{name:'Save record'}).click();await expect(card(page,'Queue policy')).toContainText('superseded');await expect(card(page,'Revision: Queue policy')).toContainText('accepted');
  await open(page,'snippets');await create(page,'Admission check',{'Code (stored as text; never executed)':'if (pending >= limit) return false;','Purpose':'Reject excess demand'});await expect(card(page,'Admission check')).toContainText('pending >= limit');
});

test('resumes exams after reload, scores submissions, shows explanations and retries mistakes',async({page})=>{
  await open(page,'exams');await page.getByRole('button',{name:'Start exam'}).click();await page.locator('[data-action="answer"]').first().click();await page.getByRole('button',{name:'Flag for review'}).click();await page.reload();await expect(page.locator('#studio-content')).toContainText('1 answered');await page.getByRole('button',{name:'Submit exam',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();
  await page.getByRole('button',{name:'Review answers'}).click();await expect(page.getByRole('dialog')).toContainText('Correct answer:');await page.getByRole('button',{name:'Close dialog'}).click();await page.getByRole('button',{name:'Retry missed questions'}).click();await expect(page.locator('#exam-question')).toBeVisible();
});

test('backs up and previews restores, respects preferences, and avoids narrow-layout overflow',async({page})=>{
  await open(page,'notes');await create(page,'Backup evidence',{'Research note':'Keep this private.'});
  await open(page,'settings');await page.getByLabel('Theme',{exact:true}).selectOption('light');await page.getByLabel('Text size').selectOption('large');await page.getByRole('button',{name:'Save preferences'}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download full backup'}).click();const backup=await download;const path=await backup.path();
  await page.getByRole('button',{name:'Reset studio…'}).click();await page.getByRole('button',{name:'Yes, reset study studio'}).click();
  await page.getByRole('button',{name:'Import backup'}).click();await page.getByLabel('JSON backup file').setInputFiles(path);await page.getByRole('button',{name:'Preview import'}).click();await expect(page.getByRole('dialog')).toContainText('Research notebook: 1');await page.getByRole('button',{name:'Merge records'}).click();
  await open(page,'notes');await expect(card(page,'Backup evidence')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByRole('link',{name:'Skip to workspace'})).not.toBeInViewport();
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:`/tmp/backend-studio-${test.info().project.name}.png`,fullPage:true});
});

test('rejects invalid pending scenarios atomically and keeps zero-valued controls',async({page})=>{
  await page.goto('/');await page.evaluate(()=>localStorage.setItem('backend-lab-pending-scenario',JSON.stringify({topic:'lsm-compaction',params:{memtableLimit:2,compaction:0}})));await page.reload();await expect(page.locator('#param-compaction')).toHaveValue('0');await expect(page.locator('#param-memtableLimit')).toHaveValue('2');
  await page.evaluate(()=>localStorage.setItem('backend-lab-pending-scenario',JSON.stringify({topic:'lsm-compaction',params:{memtableLimit:999,compaction:0}})));await page.reload();await expect(page.locator('#param-memtableLimit')).toHaveValue('3');await expect(page.locator('#param-compaction')).toHaveValue('1');await expect(page.locator('#studio-capture-feedback')).toContainText('Defaults restored');
});

test('does not record failed or canceled runs and supports capture opt-out',async({page})=>{
  await page.goto('/#event-loop');await page.route('**/api/experiments/run',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Test failure'})}));await page.locator('#run-btn').click();await expect(page.locator('#exec-status')).toHaveText('Error');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('backend-lab-studio-v1')||'{"runs":[]}').runs.length)).toBe(0);
  await page.unroute('**/api/experiments/run');
  await page.route('**/api/experiments/run',async route=>{await new Promise(resolve=>setTimeout(resolve,150));await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:{trace:[]},executionDurationMs:1})}).catch(()=>{});});
  const pending=page.waitForRequest('**/api/experiments/run');await page.locator('#run-btn').click();await pending;await page.locator('#cancel-run-btn').click();await expect(page.locator('#exec-status')).toHaveText('Cancelled');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('backend-lab-studio-v1')||'{"runs":[]}').runs.length)).toBe(0);
  await open(page,'settings');await page.getByLabel('Save successful experiment results').selectOption('false');await page.getByRole('button',{name:'Save preferences'}).click();await page.unroute('**/api/experiments/run');await page.goto('/#event-loop');await runLab(page,'event-loop');await expect(page.locator('#studio-capture-feedback')).toContainText('disabled');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('backend-lab-studio-v1')).runs.length)).toBe(0);
});

test('uses reference filters and keyboard actions, creates cards from references and exports source code',async({page})=>{
  await open(page,'library');await page.getByRole('combobox',{name:'Level',exact:true}).selectOption('advanced');await page.getByRole('button',{name:'Apply',exact:true}).click();await expect(page.locator('#studio-content .card')).toHaveCount(15);
  await page.locator('#studio-content .card').first().getByRole('button',{name:'Pin reference'}).click();await page.getByRole('combobox',{name:'Show',exact:true}).selectOption('pinned');await page.getByRole('button',{name:'Apply',exact:true}).click();await expect(page.locator('#studio-content .card')).toHaveCount(1);
  await page.getByRole('button',{name:'Create recall card'}).click();await page.getByRole('dialog').getByRole('button',{name:'Save record'}).click();
  await page.getByRole('button',{name:'Start research note'}).click();await page.getByRole('dialog').getByRole('button',{name:'Save record'}).click();
  await open(page,'snippets');await page.keyboard.press('Alt+n');await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('dialog').getByLabel('Title',{exact:true}).fill('SQL sample');await page.getByRole('dialog').getByRole('combobox',{name:'Language',exact:true}).selectOption('sql');await page.getByRole('dialog').getByLabel('Code (stored as text; never executed)').fill('SELECT 1;');await page.getByRole('dialog').getByRole('button',{name:'Save record'}).click();
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download code',exact:true}).click();expect((await pending).suggestedFilename()).toBe('snippet.sql');
  await page.keyboard.press('/');await expect(page.locator('#workspace-search')).toBeFocused();await page.locator('#workspace-search').fill('SELECT');await page.getByRole('button',{name:'Apply',exact:true}).click();await expect(card(page,'SQL sample')).toBeVisible();
  await card(page,'SQL sample').getByRole('button',{name:'Read',exact:true}).click();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('automatically finishes an expired exam after reload',async({page})=>{
  await open(page,'exams');await page.getByRole('combobox',{name:'Time limit',exact:true}).selectOption('5');await page.getByRole('button',{name:'Start exam'}).click();
  await page.evaluate(()=>{const key='backend-lab-studio-v1';const data=JSON.parse(localStorage.getItem(key));data.activeExam.deadline=Date.now()-1000;localStorage.setItem(key,JSON.stringify(data));});await page.reload();await expect(page.locator('#studio-content')).toContainText('timeout');await expect(page.locator('#studio-content')).toContainText('0 /');
});
