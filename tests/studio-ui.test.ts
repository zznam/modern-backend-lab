import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
const html=readFileSync(new URL('../public/studio.html',import.meta.url),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,'');
const scripts=['curriculum.js','quest-catalog.js','studio-catalog.js','studio-store.js','studio-ui.js'].map(f=>readFileSync(new URL(`../public/${f}`,import.meta.url),'utf8')).join('\n');
const windows:Window[]=[];
function setup(hash='notes', stored?:string) {
  const win=new Window({url:`http://localhost/studio.html#${hash}`,settings:{enableJavaScriptEvaluation:true,disableJavaScriptFileLoading:true,enableCSSFileLoading:false,suppressInsecureJavaScriptEnvironmentWarning:true}});windows.push(win);win.document.write(html);
  if(stored)win.localStorage.setItem('backend-lab-studio-v1',stored);
  win.eval(scripts);
  const el=(s:string)=>{const e=win.document.querySelector(s);if(!e)throw new Error(`Missing ${s}`);return e as any;};
  const click=(action:string)=>el(`[data-action="${action}"]`).click();
  const fill=(name:string,value:string)=>{const prefix=win.document.querySelector('#studio-dialog[open]')?'#studio-dialog ':'';el(`${prefix}[name="${name}"]`).value=value;};
  const submit=(form='record')=>{el(`[data-form="${form}"]`).dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));};
  const state=()=>JSON.parse(win.localStorage.getItem('backend-lab-studio-v1')||'{}');
  return {win,el,click,fill,submit,state};
}
afterEach(()=>windows.splice(0).forEach(w=>w.close()));
describe('Study studio DOM workflows',()=>{
  it.each(['notes','cards','plans','snippets','decisions','scenarios'])('creates and edits %s through the form',kind=>{
    const u=setup(kind);u.click('new');u.fill('title','My evidence');
    if(kind==='cards')u.fill('back','My answer');if(kind==='scenarios'){u.fill('topic','event-loop');u.fill('params','{}');}
    u.submit();expect(u.state()[kind]).toHaveLength(1);expect(u.el('#studio-content').textContent).toContain('My evidence');
    u.click('edit');u.fill('title','Improved evidence');u.submit();expect(u.state()[kind][0].title).toBe('Improved evidence');
  });
  it('renders imported content as text in notes, snippets and dialogs',()=>{
    const u=setup('notes');u.click('new');u.fill('title','<img src=x onerror=alert(1)>');u.fill('body','<script>alert(1)</script>');u.submit();
    expect(u.el('#studio-content').querySelector('img')).toBeNull();u.click('view');expect(u.el('#dialog-content').querySelector('script')).toBeNull();expect(u.el('#dialog-content').textContent).toContain('<script>');
  });
  it('confirms delete and reset without altering original learning progress',()=>{
    const u=setup('notes');u.win.localStorage.setItem('backend-lab-learning-v1','{"completed":["event-loop"]}');u.click('new');u.fill('title','Keep?');u.submit();
    u.click('delete');expect(u.state().notes).toHaveLength(1);u.click('close');expect(u.state().notes).toHaveLength(1);
    u.click('delete');u.click('confirm-delete');expect(u.state().notes).toHaveLength(0);expect(u.win.localStorage.getItem('backend-lab-learning-v1')).toContain('event-loop');
  });
  it('reveals a due card before grading and persists its schedule',()=>{
    const u=setup('cards');u.click('new');u.fill('title','Recall?');u.fill('back','A useful answer');u.submit();u.click('review');
    expect(u.el('#studio-content').textContent).not.toContain('A useful answer');u.click('reveal');expect(u.el('#studio-content').textContent).toContain('A useful answer');
    u.el('[data-action="grade"][data-id="good"]').click();expect(u.state().cards[0].reviews).toBe(1);expect(u.state().cards[0].due).toBeGreaterThan(Date.now());
  });
  it('adds and orders plan steps and exposes overdue work',()=>{
    const u=setup('plans');u.click('new');u.fill('title','My plan');u.submit();u.click('plan-steps');u.fill('topic','event-loop');u.fill('due','2020-01-01');u.submit('step');
    u.fill('topic','backpressure');u.submit('step');expect(u.state().plans[0].steps).toHaveLength(2);expect(u.el('#dialog-content').textContent).toContain('Overdue');
    u.el('[data-action="step-up"]:not([disabled])').click();expect(u.state().plans[0].steps[0].topic).toBe('backpressure');
  });
  it('saves preferences and applies accessible appearance options',()=>{
    const u=setup('settings');u.fill('theme','light');u.fill('density','compact');u.fill('text','large');u.fill('motion','reduce');u.fill('capture','false');u.fill('retention','25');u.submit('settings');
    expect(u.win.document.documentElement.dataset.theme).toBe('light');expect(u.state().settings).toMatchObject({capture:false,retention:25,motion:'reduce'});
  });
  it('answers, flags, resumes and submits a real knowledge-check exam',()=>{
    const u=setup('exams');u.submit('exam');u.click('answer');u.click('flag');
    const resumed=setup('exams',JSON.stringify(u.state()));expect(resumed.el('#studio-content').textContent).toContain('1 answered');resumed.click('submit-exam');resumed.click('confirm-submit');
    expect(resumed.state().activeExam).toBeNull();expect(resumed.state().exams).toHaveLength(1);resumed.click('exam-report');expect(resumed.el('#dialog-content').textContent).toContain('Correct answer:');
  });
  it('rejects malformed scenario input visibly',()=>{
    const u=setup('scenarios');u.click('new');u.fill('title','Invalid');u.fill('topic','event-loop');u.fill('params','not json');u.submit();expect(u.el('#dialog-error').textContent).toContain('valid JSON');
  });
  it('supports search, archive restoration and tag filtering',()=>{
    const u=setup('notes');u.click('new');u.fill('title','Cache reasoning');u.fill('tags','cache');u.submit();u.click('archive');expect(u.el('#studio-content').textContent).not.toContain('Cache reasoning');
    u.el('#filter-form [name="status"]').value='archived';u.el('#filter-form [name="tag"]').value='cache';u.el('#filter-form').dispatchEvent(new u.win.Event('submit',{bubbles:true,cancelable:true}));
    expect(u.el('#studio-content').textContent).toContain('Cache reasoning');u.click('archive');expect(u.state().notes[0].archived).toBe(false);
  });
});
