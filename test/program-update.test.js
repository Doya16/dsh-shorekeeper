import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {DesktopManager,EXE,validateProgram,compareVersions,downloadProgram} from '../lib/desktop.js';

const hash=b=>createHash('sha256').update(b).digest('hex');
const contents={[EXE]:'LAUNCHER',['.programs/9.0.0/'+EXE]:'CORE','.programs/9.0.0/_internal/runtime.dll':'DLL','tools/shorekeeper-updater.exe':'HELPER'};
const bytes=Buffer.from('verified test archive');
const program={schema:1,repository:'Doya16/dsh-shorekeeper',version:'9.0.0',minimum_version:'0.0.0',bridge_protocol:1,
  patch:{name:'Shorekeeper-Program-Update-v9.0.0.zip',bytes:bytes.length,sha256:hash(bytes)},
  files:Object.fromEntries(Object.entries(contents).map(([n,v])=>[n,{bytes:Buffer.byteLength(v),sha256:hash(v)}]))};
const manifest={version:'9.0.0',bytes:250000000,program};
async function put(root,name,value){const path=join(root,name);await mkdir(join(path,'..'),{recursive:true});await writeFile(path,value);}
async function fixture(t,options={}){
  const home=await mkdtemp(join(tmpdir(),'shorekeeper-program-'));t.after(()=>rm(home,{recursive:true,force:true}));
  const manager=new DesktopManager(home,manifest,{platform:'win32',arch:'x64',...options});
  await put(manager.root,EXE,'OLD');await put(manager.root,'market-runtime.json','{"version":"1.1.4"}');
  await put(manager.root,'settings.json','{"mine":true}');await put(manager.root,'assets/mine.gif','GIF');return manager;
}
test('desktop ahead of npm is never downgraded',async t=>{
  const manager=await fixture(t);await put(manager.root,'market-runtime.json','{"version":"10.0.0"}');
  const state=await manager.status();assert.equal(state.needsUpdate,false);assert.equal(state.targetVersion,'10.0.0');
  await assert.rejects(manager.install(),/无需安装旧版本/);assert.equal(compareVersions('invalid','1.0.0'),null);
});
test('program packages reject personal files, other versions and corrupt downloads',async t=>{
  for(const name of ['settings.json','audio/mine.wav','assets/mine.gif','../bad','.programs/8.0.0/evil.exe']){
    const bad=structuredClone(program);bad.files[name]={bytes:0,sha256:'0'.repeat(64)};assert.throws(()=>validateProgram(bad,'9.0.0'));
  }
  const manager=await fixture(t),path=join(manager.root,'test.zip');
  await assert.rejects(downloadProgram(program,path,'github',()=>{},async()=>new Response(Buffer.from('wrong'))),/校验失败/);
  await assert.rejects(stat(path));
});
test('installed upgrade downloads only program and passes exact verified data to independent installer',async t=>{
  let downloads=0,executed=0;
  const manager=await fixture(t,{
    download:async()=>{throw Error('full archive must not be used');},
    programDownload:async(_,path)=>{downloads++;await writeFile(path,bytes);},
    extract:async(_,root)=>{for(const [name,data]of Object.entries(contents))await put(root,name,data);},
    spawnProcess:(exe,args)=>{
      executed++;assert.match(exe,/shorekeeper-updater\.exe$/);const child=new EventEmitter();
      setImmediate(async()=>{
        const job=JSON.parse(await readFile(args[1],'utf8'));assert.equal(job.current_version,'1.1.4');assert.equal(job.parent_stopped,true);
        await put(join(args[1],'..'),'result.json','{"status":"success"}');child.emit('exit',0);
      });return child;
    },
  });
  await manager.install();assert.equal(downloads,1);assert.equal(executed,1);
  assert.equal(await readFile(join(manager.root,'settings.json'),'utf8'),'{"mine":true}');
  assert.equal(await readFile(join(manager.root,'assets/mine.gif'),'utf8'),'GIF');
});
test('next startup cleans only abandoned owned download caches',async t=>{
  const manager=await fixture(t),id=randomUUID(),dead=join(manager.root,'.update-cache',id);
  await put(dead,'owner.json',JSON.stringify({id,root:manager.root,pid:0}));await put(dead,'program.zip','partial');
  const activeId=randomUUID(),active=join(manager.root,'.update-cache',activeId);
  await put(active,'owner.json',JSON.stringify({id:activeId,root:manager.root,pid:process.pid}));
  await put(manager.root,'.update-cache/user-notes/note','keep');
  await manager.recoverUpdate();await assert.rejects(stat(dead));assert.ok(await stat(active));assert.ok(await stat(join(manager.root,'.update-cache/user-notes/note')));
});
