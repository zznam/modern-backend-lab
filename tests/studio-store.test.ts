import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = ['curriculum.js', 'quest-catalog.js', 'studio-catalog.js', 'studio-store.js'].map(f=>readFileSync(new URL(`../public/${f}`,import.meta.url),'utf8')).join('\n');
function setup() {
  let now = Date.parse('2026-11-16T10:00:00Z');
  const data = new Map<string,string>();
  const storage = { getItem: (k:string)=>data.get(k)||null, setItem: (k:string,v:string)=>{data.set(k,v);} };
  const ctx:any = { crypto: {randomUUID:()=>crypto.randomUUID()}, Date, Math, console, Blob };
  runInNewContext(source+'\nglobalThis.catalog=STUDIO_TOPICS;globalThis.quizzes=QUEST_QUIZZES;',ctx);
  const make = () => new ctx.StudyStore({topics:ctx.catalog, quizzes:ctx.quizzes, storage, now:()=>now});
  return {store:make(), make, data, storage, ctx, advance:(ms:number)=>{now+=ms;},now:()=>now};
}

describe('Study studio data and workflows',()=>{
  it('covers all 49 current labs using real curriculum material',()=>{
    const {ctx}=setup(); expect(Object.keys(ctx.catalog)).toHaveLength(49);
    for(const t of Object.values(ctx.catalog) as any[]) {expect(t.title).toBeTruthy();expect(t.objective).toBeTruthy();expect(t.mechanics).toBeTruthy();}
    for(const q of ctx.quizzes) expect(ctx.catalog[q.topic]).toBeDefined();
  });
  it.each(['notes','cards','plans','snippets','decisions','scenarios'])('creates, edits, duplicates, searches, archives and removes %s',kind=>{
    const {store,make}=setup();
    const id=store.save(kind,{title:'Evidence',topic:'event-loop',body:'Private reasoning',back:'Answer',params:{},tags:['runtime','runtime']});
    expect(make().state[kind][0].id).toBe(id);
    store.save(kind,{id,title:'Updated evidence'});
    expect(store.state[kind][0].tags).toEqual(['runtime']);
    expect(store.query(kind,{search:'updated',topic:'event-loop',tag:'runtime'})).toHaveLength(1);
    store.toggle(kind,id,'pinned'); expect(store.query(kind,{status:'pinned'})).toHaveLength(1);
    store.toggle(kind,id,'archived');expect(store.query(kind)).toHaveLength(0);
    expect(store.query(kind,{status:'archived'})).toHaveLength(1);
    store.toggle(kind,id,'archived');store.duplicate(kind,id);expect(store.state[kind]).toHaveLength(2);
    store.remove(kind,id);expect(store.state[kind]).toHaveLength(1);
  });
  it('keeps simultaneous tabs from overwriting unrelated records',()=>{
    const {store,make}=setup(); const other=make();
    store.save('notes',{title:'First'});other.save('notes',{title:'Second'});
    store.save('snippets',{title:'Third',language:'sql',body:'SELECT 1;'});
    expect(make().state.notes).toHaveLength(2);expect(make().state.snippets).toHaveLength(1);
  });
  it('keeps changes available for export when storage fails',()=>{
    const {store,storage}=setup();storage.setItem=()=>{throw new Error('quota');};
    store.save('notes',{title:'Survives quota'});store.save('notes',{title:'Second session note'});
    expect(store.state.notes).toHaveLength(2);expect(store.storageError).toContain('only in this tab');
    expect(store.export()).toContain('Survives quota');
  });
  it('rejects empty records and unsafe or nonnumeric scenario parameters atomically',()=>{
    const {store}=setup();
    expect(()=>store.save('notes',{title:' '})).toThrow();
    expect(()=>store.save('cards',{title:'Question'})).toThrow();
    for(const params of [[],null,{a:'1'},{a:Infinity},JSON.parse('{"__proto__":1}')]) expect(()=>store.save('scenarios',{title:'Bad',topic:'event-loop',params})).toThrow();
    expect(store.state.scenarios).toHaveLength(0);
    store.save('scenarios',{title:'Zero preserved',topic:'lsm-compaction',params:{compaction:0}});
    expect(store.state.scenarios[0].params.compaction).toBe(0);
  });
  it('captures bounded successful results, retains pinned evidence, and honors capture settings',()=>{
    const {store,advance}=setup();store.settings({retention:25});
    store.capture('event-loop',{}, {data:{trace:['first']},executionDurationMs:5});const first=store.state.runs[0].id;store.toggle('runs',first,'pinned');
    for(let i=0;i<30;i++){advance(1);store.capture('event-loop',{}, {data:{trace:[i]},executionDurationMs:i});}
    expect(store.state.runs).toHaveLength(25);expect(store.state.runs.some((r:any)=>r.id===first)).toBe(true);
    store.capture('event-loop',{}, {data:'x'.repeat(25000)});expect(store.state.runs[0].result.summary).toContain('24 KB');
    store.settings({capture:false});const before=store.state.runs.length;
    store.capture('event-loop',{}, {data:{}});store.capture('unknown',{}, {data:{}});store.capture('event-loop',{}, {});
    expect(store.state.runs).toHaveLength(before);
  });
  it('compares same-topic metrics, labels history, and rejects cross-topic baselines',()=>{
    const {store,advance}=setup();store.capture('event-loop',{limit:5},{data:{metrics:[{label:'Count',value:2}]},executionDurationMs:8});
    store.baseline(store.state.runs[0].id);advance(10);
    store.capture('event-loop',{limit:6},{data:{metrics:[{label:'Count',value:4}]},executionDurationMs:12});
    const id=store.state.runs[0].id;store.labelRun(id,'=formula');
    expect(store.query('runs',{search:'=formula'})).toHaveLength(1);
    expect(store.compare(id)).toContainEqual({key:'Count',before:2,after:4,delta:2});
    expect(store.export('runs','csv')).toContain("'=formula");
    advance(10);store.capture('backpressure',{}, {data:{}});
    expect(()=>store.compare(store.state.runs[0].id)).toThrow('same lab');
    store.remove('runs',store.state.baseline);expect(store.state.baseline).toBe('');
  });
  it.each([['again',600000,1],['hard',86400000,0],['good',172800000,0],['easy',345600000,0]])('schedules %s cards and rejects repeated grading', (grade,delay,lapses)=>{
    const {store,now}=setup();const id=store.save('cards',{title:'Why?',back:'Because',deck:'Systems'});
    expect(store.dueCards('Systems')).toHaveLength(1);store.gradeCard(id,grade);
    expect(store.state.cards[0].due).toBe(now()+Number(delay));expect(store.state.cards[0].lapses).toBe(lapses);
    expect(()=>store.gradeCard(id,grade)).toThrow('not due');expect(store.dueCards()).toHaveLength(0);
  });
  it('excludes suspended and archived cards while retaining review statistics',()=>{
    const {store,advance}=setup();const id=store.save('cards',{title:'Question',back:'Answer'});
    store.gradeCard(id,'again');advance(600001);expect(store.dueCards()).toHaveLength(1);
    store.toggle('cards',id,'suspended');expect(store.dueCards()).toHaveLength(0);
    store.toggle('cards',id,'suspended');store.toggle('cards',id,'archived');expect(store.dueCards()).toHaveLength(0);
    expect(store.analytics()).toMatchObject({reviews:1,lapses:1});
  });
  it('supports plan step ordering, due dates, status and removal without affecting other plans',()=>{
    const {store}=setup();const id=store.save('plans',{title:'Systems',due:'2026-12-01'});
    store.addStep(id,'event-loop','2026-11-17');store.addStep(id,'backpressure','2026-11-18');
    const step=store.state.plans[0].steps[1].id;
    store.step(id,step,'move',-1);store.step(id,step,'status','done');store.step(id,step,'due','2026-11-20');
    expect(store.state.plans[0].steps[0]).toMatchObject({topic:'backpressure',status:'done',due:'2026-11-20'});
    expect(store.export('plans','md')).toContain('- [x]');store.step(id,step,'remove');expect(store.state.plans[0].steps).toHaveLength(1);
    store.save('plans',{id,title:'Systems',due:'2026-99-99'});expect(store.state.plans[0].due).toBe('');
  });
  it('persists exams, answers and flags, then scores unanswered questions and supports missed-question retries',()=>{
    const {store,make}=setup();store.startExam({count:5});
    const e=store.state.activeExam, q=store.quizzes.find((q:any)=>q.id===e.questions[0]);
    store.examAction('answer',q.answer);store.examAction('flag');store.examAction('navigate',4);
    const resumed=make();expect(resumed.state.activeExam.index).toBe(4);expect(resumed.state.activeExam.flagged).toEqual([q.id]);
    resumed.examAction('submit');const attempt=resumed.state.exams[0];expect(resumed.score(attempt)).toMatchObject({correct:1,total:5,percent:20});
    resumed.startExam({questions:resumed.score(attempt).wrong,count:5});expect(resumed.state.activeExam.questions).toHaveLength(4);
    expect(()=>resumed.startExam()).toThrow('current exam');resumed.examAction('abandon');expect(resumed.state.exams[0].reason).toBe('abandoned');
  });
  it('enforces exam deadlines even after reload before accepting an answer',()=>{
    const {store,advance,make}=setup();store.startExam({count:5,minutes:1});advance(60000);
    const resumed=make();resumed.examAction('answer',0);
    expect(resumed.state.activeExam).toBeNull();expect(resumed.state.exams[0].reason).toBe('timeout');expect(resumed.state.exams[0].answers).toEqual({});
  });
  it('exports, previews and merges idempotently; replacement scopes to its collection',()=>{
    const {store}=setup();store.save('notes',{title:'A',body:'<script>not executed</script>'});store.save('cards',{title:'Q',back:'A'});
    const full=store.previewImport(store.export());store.import(full);store.import(full);expect(store.state.notes).toHaveLength(1);
    const noteBackup=store.previewImport(store.export('notes'));store.save('notes',{title:'B'});store.import(noteBackup,'replace');expect(store.state.notes).toHaveLength(1);expect(store.state.cards).toHaveLength(1);
    store.settings({theme:'light'});store.import(full,'replace');expect(store.state.settings.theme).toBe('system');
    store.reset();expect(store.state.notes).toHaveLength(0);expect(store.state.cards).toHaveLength(0);
  });
  it('rejects unsupported/oversized backups and normalizes hostile records without prototype pollution',()=>{
    const {store}=setup();for(const value of ['bad','{}',JSON.stringify({app:'backend-lab-studio',version:2,kind:'all',data:{}}),'x'.repeat(4000001)]) expect(()=>store.previewImport(value)).toThrow();
    const p=store.previewImport(JSON.stringify({app:'backend-lab-studio',version:1,kind:'all',data:{notes:[{id:'same',title:'A',topic:'__proto__'},{id:'same',title:'B'}],plans:[{title:'Bad date',due:'2026-99-99'}],settings:{theme:'evil',capture:false}}}));
    store.import(p);expect(store.state.notes).toHaveLength(1);expect(store.state.notes[0].topic).toBe('');expect(store.state.plans[0].due).toBe('');expect(({} as any).polluted).toBeUndefined();
  });
  it('calculates evidence-based insights and filters code by language and tags',()=>{
    const {store,advance}=setup();store.capture('event-loop',{}, {data:{},executionDurationMs:10});advance(1);store.capture('event-loop',{}, {data:{},executionDurationMs:20});
    store.save('snippets',{title:'SQL',language:'sql',body:'SELECT 1;',tags:['db']});store.save('snippets',{title:'JS',language:'javascript',body:'1+1'});
    expect(store.query('snippets',{language:'sql',tag:'db'})).toHaveLength(1);
    expect(store.analytics()).toMatchObject({runs:2,time:30,topics:1});expect(store.analytics().perTopic[0]).toMatchObject({average:15,best:10});
    store.bookmark('event-loop');expect(store.state.bookmarks).toEqual(['event-loop']);store.bookmark('event-loop');expect(store.state.bookmarks).toEqual([]);
  });
});

describe('Studio retention and backup boundaries',()=>{
  it('refuses to evict pinned evidence and trims unpinned history when retention is lowered',()=>{
    const {store,advance}=setup();store.settings({retention:50});
    for(let i=0;i<30;i++){advance(1);store.capture('event-loop',{}, {data:{},executionDurationMs:i});}
    store.settings({retention:25});expect(store.state.runs).toHaveLength(25);
    for(const r of [...store.state.runs])store.toggle('runs',r.id,'pinned');
    expect(()=>store.capture('event-loop',{}, {data:{}})).toThrow('full of pinned');
    expect(store.state.runs).toHaveLength(25);store.settings({retention:50});
    advance(1);store.capture('event-loop',{}, {data:{}});store.toggle('runs',store.state.runs[0].id,'pinned');
    expect(()=>store.settings({retention:25})).toThrow('Unpin');expect(store.state.settings.retention).toBe(50);
  });
  it('rejects over-capacity data atomically while allowing its own export to round-trip',()=>{
    const {store}=setup();store.save('notes',{title:'Original'});
    const backup={app:'backend-lab-studio',version:1,kind:'notes',data:Array.from({length:270},(_,i)=>({id:`note-${i}`,title:`Note ${i}`,body:'x'.repeat(12000)}))};
    const preview=store.previewImport(JSON.stringify(backup));expect(()=>store.import(preview,'replace')).toThrow('3 MB');expect(store.state.notes[0].title).toBe('Original');
    store.import(store.previewImport(store.export()),'replace');expect(store.state.notes[0].title).toBe('Original');
  });
  it('accepts a successor decision and supersedes its predecessor in the same save',()=>{
    const {store}=setup();const first=store.save('decisions',{title:'Original',status:'accepted'});
    const second=store.save('decisions',{title:'Replacement',status:'proposed',supersedes:first});expect(store.state.decisions.find((e:any)=>e.id===first).status).toBe('accepted');
    store.save('decisions',{id:second,status:'accepted'});expect(store.state.decisions.find((e:any)=>e.id===first).status).toBe('superseded');
    expect(store.export('decisions','md')).toContain('## Alternatives');
  });
});
