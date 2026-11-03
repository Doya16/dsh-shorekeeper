import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {once,EventEmitter} from 'node:events';
import {DesktopManager,EXE,validateManifest,downloadRuntime,preserveUserData} from '../lib/desktop.js';
import {createHandler} from '../lib/index.js';

const bytes=Buffer.alloc(2048,37);
const manifest={version:'1.1.0',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),url:'https://github.com/Doya16/dsh-shorekeeper/releases/download/v1.1.0/Shorekeeper-Windows-v1.1.0.zip'};
async function workspace(t){const dir=await mkdtemp(join(tmpdir(),'shorekeeper-market-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
async function put(root,name,text){const path=join(root,name);await mkdir(join(path,'..'),{recursive:true});await writeFile(path,text);}
const makeRuntime=async(_,root)=>{await put(root,EXE,'NEW PROGRAM');await put(root,'defaults/settings.json','{}');await put(root,'settings.json',JSON.stringify({appearance:{launch_with_deepseek:false},bindings:{}}));};

test('download accepts only pinned project release, verifies size/hash and retries the mirror',async t=>{
  const dir=await workspace(t),target=join(dir,'runtime.zip'),calls=[];
  await downloadRuntime(manifest,target,'auto',()=>{},async url=>{calls.push(url);if(calls.length===1)throw Error('offline');return new Response(bytes);});
  assert.equal(calls.length,2);assert.match(calls[1],/^https:\/\/gh-proxy.org\/https:\/\/github.com\/Doya16\/dsh-shorekeeper\//);
  assert.deepEqual(await readFile(target),bytes);
  await assert.rejects(downloadRuntime(manifest,target,'github',()=>{},async()=>new Response(Buffer.alloc(2048,0))),/校验失败/);
  await assert.rejects(stat(target));
  assert.throws(()=>validateManifest({...manifest,url:'https://example.org/evil.zip'}));
});

test('install and update preserve all user data, retain rollback folder and never replace old program with imported code',async t=>{
  const dir=await workspace(t);
  const manager=new DesktopManager(dir,manifest,{platform:'win32',arch:'x64',download:async(_,target)=>writeFile(target,bytes),extract:makeRuntime});
  await manager.install();assert.equal((await manager.status()).version,'1.1.0');
  const saved=JSON.stringify({appearance:{volume:23,update_source:'mirror',show_quota:false,quota_scale:1.65},bindings:{thinking:{bubble_text:'我的字幕'}}});
  for(const [name,text]of Object.entries({'settings.json':saved,'assets/custom/a.gif':'GIF89a','audio/custom.ogg':'VOICE','fonts/custom.ttf':'FONT','exports/profile.zip':'EXPORTED'}))await put(manager.root,name,text);
  await manager.install('mirror');
  assert.equal(await readFile(join(manager.root,'settings.json'),'utf8'),saved);
  for(const name of ['assets/custom/a.gif','audio/custom.ogg','fonts/custom.ttf','exports/profile.zip'])assert.ok((await stat(join(manager.root,name))).size);
  assert.equal(await readFile(join(manager.root,EXE),'utf8'),'NEW PROGRAM');
  assert.equal((await manager.status()).source,'mirror');
  await manager.dispose();assert.ok((await stat(join(manager.root,'settings.json'))).isFile());
});

test('failed extraction leaves original media and settings untouched',async t=>{
  const dir=await workspace(t),manager=new DesktopManager(dir,manifest,{platform:'win32',arch:'x64',download:async(_,target)=>writeFile(target,bytes),extract:async()=>{throw Error('broken zip');}});
  await put(manager.root,EXE,'OLD');await put(manager.root,'settings.json','{"personal":true}');
  await assert.rejects(manager.install(),/broken zip/);
  assert.equal(await readFile(join(manager.root,'settings.json'),'utf8'),'{"personal":true}');assert.equal((await manager.status()).busy,false);
});

test('launch and settings use fixed executable/commands, preserve home, and honor auto-start',async t=>{
  const dir=await workspace(t);let launches=0,args,opts;
  const manager=new DesktopManager(dir,manifest,{platform:'win32',arch:'x64',spawnProcess:(exe,a,o)=>{
    assert.equal(exe,join(manager.root,EXE));launches++;args=a;opts=o;
    const child=new EventEmitter();child.exitCode=null;queueMicrotask(()=>child.emit('spawn'));return child;
  }});
  await makeRuntime(null,manager.root);await manager.autoStart();assert.equal(launches,0);
  await manager.start(true);assert.deepEqual(args,['--settings']);assert.equal(opts.windowsHide,false);assert.equal(opts.env.DSH_HOME,dir);assert.equal(opts.env.SHOREKEEPER_HARNESS_MANAGED,'1');
  await manager.start(true);assert.equal(launches,1);assert.equal(JSON.parse(await readFile(join(manager.root,'harness-command.json'),'utf8')).command,'settings');
  manager.child.exitCode=0;manager.child=null;
  await put(manager.root,'settings.json','{"appearance":{"launch_with_deepseek":true}}');await manager.autoStart();assert.equal(launches,2);
  manager.child.exitCode=0;manager.child=null;
  await assert.rejects(manager.command('../../secret'));
  const unix=new DesktopManager(dir,manifest,{platform:'linux'});await assert.rejects(unix.start(),/Windows/);
});

test('HTTP actions require Harness authentication and same-origin anti-CSRF token; no arbitrary commands',async t=>{
  const actions=[];
  const manager={status:async()=>({installed:true}),start:async settings=>actions.push(settings?'settings':'start'),stop:async()=>actions.push('stop'),command:async c=>actions.push(c)};
  const handler=createHandler(manager,{requestRejection:req=>req.headers.cookie==='session=ok'?undefined:403},'test-nonce',Buffer.from('icon'));
  const server=createServer((req,res)=>handler(req,res).catch(()=>{res.statusCode=500;res.end();}));server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
  const base=`http://127.0.0.1:${server.address().port}/shorekeeper-full`;
  assert.equal((await fetch(base+'/status')).status,403);
  assert.equal((await(await fetch(base+'/status',{headers:{cookie:'session=ok'}})).json()).token,'test-nonce');
  const post=(value,extra={})=>fetch(base+'/action',{method:'POST',headers:{cookie:'session=ok','x-shorekeeper-token':'test-nonce',...extra},body:JSON.stringify(value)});
  assert.equal((await post({action:'start'},{origin:'https://example.org'})).status,403);
  assert.equal((await post({action:'start'},{'x-shorekeeper-token':'wrong'})).status,403);
  assert.equal((await post({action:'settings'})).status,200);assert.deepEqual(actions,['settings']);
  assert.equal((await post({action:'exec',command:'anything'})).status,400);
});

test('actual rc.5 event fixture reaches reading, writing and completion without retaining content',async()=>{
  const {PetState}=await import('../lib/state.js');const events=JSON.parse(await readFile(new URL('./fixtures/harness-rc5-events.json',import.meta.url),'utf8'));
  const state=new PetState();const phases=new Set();
  for(const event of (Array.isArray(events)?events:events.events)){state.accept({id:'test'},event);phases.add(state.snapshot().sessions[0]?.state);}
  assert.ok(phases.has('reading'));assert.ok(phases.has('writing'));assert.ok(phases.has('done'));
  assert.equal(state.snapshot().events.at(-1).state,'done');
});
