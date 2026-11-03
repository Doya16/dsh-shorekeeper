// Windows full desktop runtime. No postinstall hooks; download/launch follows a
// button click, or the user's persisted launch-with-Harness preference.
import {mkdir, readFile, writeFile, rename, rm, cp, stat, lstat, readdir} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {join, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {Readable, Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

export const EXE = '守岸人DeepSeek桌宠启动.exe';
export const MIRROR = 'https://gh-proxy.org/';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const exists = async path => !!await stat(path).catch(() => null);
const json = async path => JSON.parse(await readFile(path, 'utf8'));
export function compareVersions(a,b) {
  if (![a,b].every(v=>typeof v==='string'&&/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(v))) return null;
  const x=a.split('.').map(Number),y=b.split('.').map(Number);
  for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]<y[i]?-1:1;
  return 0;
}
function programFile(name) {
  if(typeof name!=='string'||!name||/[\\:]/.test(name))return false;
  const parts=name.split('/');
  if(parts.some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(p)))return false;
  return name===EXE||['BUILD_INFO.json','requirements.txt','LICENSE','THIRD_PARTY.txt','MIGRATION.txt'].includes(name)
    ||['shorekeeper_pet/','resources/','integrations/'].some(p=>name.startsWith(p))
    ||/^\.programs\/\d{1,5}\.\d{1,5}\.\d{1,5}\/.+/.test(name)
    ||['tools/shorekeeper-updater.exe','tools/run_pet.py','tools/create_shortcut.ps1','tools/install_deepseek_plugin.ps1'].includes(name);
}
export function validateProgram(program,version) {
  if(!program||program.schema!==1||program.repository!=='Doya16/dsh-shorekeeper'||program.version!==version
    ||compareVersions(program.minimum_version,version)===null||program.bridge_protocol!==1)throw Error('程序更新清单不匹配');
  const p=program.patch;
  if(!p||p.name!==`Shorekeeper-Program-Update-v${version}.zip`||!Number.isInteger(p.bytes)||p.bytes<1||p.bytes>350_000_000||!/^\w{64}$/.test(p.sha256)||!/^[a-f0-9]+$/.test(p.sha256))throw Error('程序包校验信息无效');
  const entries=Object.entries(program.files||{}),seen=new Set();let bytes=0;
  if(entries.length<2||entries.length>8000)throw Error('程序文件列表无效');
  for(const [name,entry]of entries){
    if(!programFile(name)||(name.startsWith('.programs/')&&!name.startsWith(`.programs/${version}/`))||seen.has(name.toLowerCase())||!entry||!Number.isInteger(entry.bytes)||entry.bytes<0||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('程序包包含不允许的文件');
    seen.add(name.toLowerCase());bytes+=entry.bytes;
  }
  if(bytes>1_200_000_000||!program.files[EXE]||!program.files['tools/shorekeeper-updater.exe']||!program.files[`.programs/${version}/${EXE}`]||!entries.some(([name])=>name.startsWith(`.programs/${version}/_internal/`)))throw Error('程序包不完整');
  return {version,bytes:p.bytes,sha256:p.sha256,url:`https://github.com/Doya16/dsh-shorekeeper/releases/download/v${version}/${p.name}`};
}
export async function atomicJson(path, data) {
  await mkdir(dirname(path), {recursive: true});
  const temp = path + '.' + randomUUID() + '.tmp';
  await writeFile(temp, JSON.stringify(data, null, 2), {mode: 0o600});
  await rename(temp, path);
}
export function validateManifest(m) {
  if (!/^\d+\.\d+\.\d+$/.test(m.version) || !/^[a-f0-9]{64}$/.test(m.sha256) ||
      !Number.isInteger(m.bytes) || m.bytes < 1000 || m.bytes > 600_000_000 ||
      m.url !== `https://github.com/Doya16/dsh-shorekeeper/releases/download/v${m.version}/Shorekeeper-Windows-v${m.version}.zip`) {
    throw new Error('完整版清单不正确');
  }
  return m;
}
export async function downloadRuntime(m, destination, source, progress, fetcher=fetch, signal) {
  validateManifest(m);
  return downloadChecked(m,destination,source,progress,fetcher,signal);
}
export async function downloadProgram(program,destination,source,progress,fetcher=fetch,signal) {
  const m=validateProgram(program,program.version);
  return downloadChecked(m,destination,source,progress,fetcher,signal);
}
async function downloadChecked(m, destination, source, progress, fetcher=fetch, signal) {
  const routes = source === 'auto' ? ['github', 'mirror'] : [source];
  if (routes.some(route => !['github','mirror'].includes(route))) throw new Error('无效下载来源');
  let last;
  for (const route of routes) {
    try {
      const response = await fetcher((route === 'mirror' ? MIRROR : '') + m.url, {
        signal: AbortSignal.any([AbortSignal.timeout(600_000), ...(signal ? [signal] : [])]),
        credentials: 'omit', headers: {'User-Agent': 'dsh-shorekeeper/' + m.version},
      });
      if (!response.ok || !response.body) throw new Error('下载请求失败');
      const hash=createHash('sha256'); let received=0;
      const check = new Transform({transform(chunk, enc, done) {
        received += chunk.length;
        if (received > m.bytes) return done(new Error('下载文件大小不符'));
        hash.update(chunk); progress(Math.floor(received/m.bytes*100),route); done(null,chunk);
      }});
      await pipeline(Readable.fromWeb(response.body), check, createWriteStream(destination, {flags:'w',mode:0o600}), ...(signal ? [{signal}] : []));
      if (received !== m.bytes || hash.digest('hex') !== m.sha256) throw new Error('下载文件校验失败');
      return route;
    } catch(error) {
      await rm(destination,{force:true}); last=error;
      if (signal?.aborted) throw error;
    }
  }
  throw last || new Error('无法下载完整版');
}
export function extractRuntime(archive,destination,runner=spawn) {
  const script=fileURLToPath(new URL('../tools/extract-runtime.ps1',import.meta.url));
  return new Promise((resolve,reject) => {
    const child=runner('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Archive',archive,'-Destination',destination],{windowsHide:true,stdio:['ignore','ignore','pipe']});
    let error='';child.stderr.on('data',chunk=>{error=(error+chunk.toString()).slice(-2000);});
    child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('解压失败，请重试或检查磁盘空间。')));
  });
}
export async function preserveUserData(oldRoot,newRoot) {
  // Never copy executables, DLLs, connection files, credentials or chat logs.
  for (const name of ['settings.json','settings.json.bak','voice-history.json','assets','audio','fonts','exports','backups']) {
    const source=join(oldRoot,name);
    if (!await exists(source)) continue;
    if ((await lstat(source)).isSymbolicLink()) throw new Error('配置目录包含链接，请先导出配置素材包');
    await cp(source,join(newRoot,name),{recursive:true,force:true,filter:async path=>{
      if ((await lstat(path)).isSymbolicLink()) throw new Error('配置目录包含链接，请先导出配置素材包');
      return true;
    }});
  }
}
function pidAlive(pid){
  if(!Number.isInteger(pid)||pid<=0)return false;
  try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}
}
async function rejectLinks(root){
  if((await lstat(root)).isSymbolicLink())throw Error('更新目录不能包含链接');
  for(const entry of await readdir(root,{withFileTypes:true})){
    const path=join(root,entry.name);
    if((await lstat(path)).isSymbolicLink())throw Error('更新目录不能包含链接');
    if(entry.isDirectory())await rejectLinks(path);
  }
}
export class DesktopManager {
  constructor(home,manifest,{platform=process.platform,arch=process.arch,spawnProcess=spawn,download=downloadRuntime,extract=extractRuntime,programDownload=downloadProgram}={}) {
    this.home=home;this.base=join(home,'shorekeeper-market');this.root=join(this.base,'app');
    this.manifest=manifest;this.supported=platform==='win32'&&arch==='x64';
    this.spawnProcess=spawnProcess;this.download=download;this.extract=extract;this.programDownload=programDownload;
    this.busy=false;this.message='';this.child=null;this.disposed=false;this.progress=null;
    this.abort=new AbortController();
  }
  async settings() {return (await json(join(this.root,'settings.json')).catch(()=>({}))).appearance||{};}
  async status() {
    const installed=await exists(join(this.root,EXE));
    const info=await json(join(this.root,'market-runtime.json')).catch(()=>({}));
    const health=await json(join(this.root,'runtime.json')).catch(()=>({}));
    const running=!!(this.child&&this.child.exitCode===null) || (installed&&health.updated_at>Date.now()/1000-12);
    const prefs=await json(join(this.base,'download-preferences.json')).catch(()=>({}));
    const version=info.version||health.version||'',comparison=compareVersions(version,this.manifest.version);
    return {supported:this.supported,installed,running,busy:this.busy,progress:this.progress,
      message:this.message,version,targetVersion:comparison>0?version:this.manifest.version,
      needsUpdate:installed&&(comparison===null||comparison<0),source:prefs.source||'auto',
      megabytes:Math.ceil(this.manifest.bytes/1024/1024)};
  }
  async command(command) {
    if (!['close','show','hide','settings'].includes(command)) throw new Error('无效操作');
    await atomicJson(join(this.root,'harness-command.json'),{command,time:Date.now()/1000,id:randomUUID()});
  }
  async recoverUpdate(){
    const journal=await json(join(this.root,'.update-transaction.json')).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(journal){
      if(resolve(journal.root)!==resolve(this.root))throw Error('更新日志目录不匹配');
      if(pidAlive(journal.pid))throw Error('正在安装更新，请稍候');
      if(journal.phase==='committed'){await rm(join(this.root,'.update-transaction.json'));}
      else if(!journal.legacy){
        const child=this.spawnProcess(join(this.root,EXE),['--recover-only'],{cwd:this.root,windowsHide:true,stdio:'ignore'});
        await new Promise((done,fail)=>{child.once('error',fail);child.once('exit',code=>code===0?done():fail(Error('上次更新恢复未完成，请重试')));});
      } else {
        // The launcher handles versioned installs. This path also recovers a
        // first upgrade interrupted before the old EXE was replaced.
        if(!/^[a-f0-9-]{36}$/.test(journal.id))throw Error('更新标识无效');
        const work=join(this.root,'.update-cache',journal.id);
        await rejectLinks(work);
        const m=await json(join(work,'manifest.json'));validateProgram(m,journal.target_version);
        const helper=join(work,'payload','tools','shorekeeper-updater.exe');
        const data=await readFile(helper),expected=m.files['tools/shorekeeper-updater.exe'];
        if(data.length!==expected.bytes||createHash('sha256').update(data).digest('hex')!==expected.sha256)throw Error('恢复助手校验失败');
        const child=this.spawnProcess(helper,['--recover-root',this.root,'--recover-only'],{cwd:this.root,windowsHide:true,stdio:'ignore'});
        await new Promise((done,fail)=>{child.once('error',fail);child.once('exit',code=>code===0?done():fail(Error('上次更新恢复未完成，请重试')));});
      }
    }
    const base=join(this.root,'.update-cache');
    if(!await exists(base))return;
    if((await lstat(base)).isSymbolicLink())throw Error('更新缓存不能是链接');
    for(const entry of await readdir(base,{withFileTypes:true})){
      if(!entry.isDirectory()||!/^[-a-f0-9]{36}$/.test(entry.name))continue;
      const work=join(base,entry.name);
      try{
        await rejectLinks(work);const owner=await json(join(work,'owner.json'));
        if(owner.id!==entry.name||resolve(owner.root)!==resolve(this.root)||pidAlive(owner.pid))continue;
        await rm(work,{recursive:true,force:true});
      }catch{}
    }
  }
  async start(settings=false) {
    if (!this.supported) throw new Error('完整版需要 Windows 10/11 x64 本机 Harness');
    if (this.disposed||this.busy) throw new Error('请等待当前操作完成');
    await this.recoverUpdate();
    const status=await this.status();
    if (!status.installed) throw new Error('请先安装完整版');
    if (status.running) {await this.command(settings?'settings':'show');return;}
    await rm(join(this.root,'harness-command.json'),{force:true});
    const child=this.spawnProcess(join(this.root,EXE),settings?['--settings']:[],{
      // This is the requested GUI, not a shell helper. SW_HIDE would suppress
      // Qt's first ShowWindow call, making a successfully started pet invisible.
      cwd:this.root,windowsHide:false,stdio:'ignore',
      env:{...process.env,DSH_HOME:this.home,SHOREKEEPER_HARNESS_MANAGED:'1'},
    });
    this.child=child;
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
    child.on('exit',()=>{if(this.child===child)this.child=null;});
    this.message='已启动，可右键桌宠打开完整设置';
  }
  async stop() {
    const state=await this.status();
    if (!state.running) return;
    await this.command('close');
    const child=this.child;
    if(child&&child.exitCode===null){
      await Promise.race([new Promise(resolve=>child.once('exit',resolve)),sleep(7000)]);
      if(child.exitCode===null) throw new Error('桌宠正在保存，请关闭桌宠后重试');
    } else {
      // A live process started outside this host is never force-killed.
      for(let i=0;i<15;i++){await sleep(500);const h=await json(join(this.root,'runtime.json')).catch(()=>({}));if(h.closed)return;}
      throw new Error('请先从桌宠菜单关闭守岸人，再安装更新');
    }
  }
  async install(source='auto') {
    if(!this.supported)throw new Error('完整版需要 Windows 10/11 x64 本机 Harness');
    if(this.busy)throw new Error('安装正在进行');
    if(!['auto','github','mirror'].includes(source))throw new Error('无效下载来源');
    const installed=await this.status();
    if(installed.installed&&compareVersions(installed.version,this.manifest.version)>0)throw Error('桌宠程序已更新，无需安装旧版本');
    if(installed.installed&&this.manifest.program)return this.installProgram(source,installed.version||'0.0.0');
    this.busy=true;this.message='正在下载完整桌宠…';this.progress=0;
    const id=randomUUID(),archive=join(this.base,`download-${id}.zip`),stage=join(this.base,`staging-${id}`);
    let previous;
    try {
      await mkdir(this.base,{recursive:true});
      await atomicJson(join(this.base,'download-preferences.json'),{source});
      await this.download(this.manifest,archive,source,(n)=>{this.progress=n;},undefined,this.abort.signal);
      this.message='校验通过，正在解压…';await this.extract(archive,stage);
      if(!await exists(join(stage,EXE))||!await exists(join(stage,'defaults/settings.json')))throw new Error('完整版文件不完整');
      if(this.disposed)throw new Error('插件已停用');
      await this.stop();
      if(await exists(this.root)){
        await preserveUserData(this.root,stage);
        previous=join(this.base,'previous-'+Date.now());await rename(this.root,previous);
      }
      try {await rename(stage,this.root);} catch(error){if(previous)await rename(previous,this.root);throw error;}
      await atomicJson(join(this.root,'market-runtime.json'),{version:this.manifest.version,sha256:this.manifest.sha256});
      this.message='完整版已就绪，个人配置和素材已保留';
    } catch(error) {this.message=error.message||'安装失败，请重试';throw error;}
    finally {try{await rm(archive,{force:true});await rm(stage,{recursive:true,force:true});}finally{this.busy=false;this.progress=null;}}
  }
  async installProgram(source,current) {
    validateProgram(this.manifest.program,this.manifest.version);
    if(compareVersions(current,this.manifest.version)===null)throw Error('无法识别当前程序版本');
    if(compareVersions(current,this.manifest.version)>=0){this.message='已是最新程序版本';return;}
    if(compareVersions(current,this.manifest.program.minimum_version)<0)throw Error('当前版本暂不支持此程序包');
    await this.recoverUpdate();
    this.busy=true;this.message='正在下载程序更新，配置和素材保留…';this.progress=0;
    const id=randomUUID(),work=join(this.root,'.update-cache',id),payload=join(work,'payload');
    let stopped=false;
    try{
      await mkdir(work,{recursive:true});await atomicJson(join(work,'owner.json'),{id,root:resolve(this.root),pid:process.pid});
      await atomicJson(join(this.base,'download-preferences.json'),{source});
      await this.programDownload(this.manifest.program,join(work,'program.zip'),source,n=>{this.progress=n;},undefined,this.abort.signal);
      await this.extract(join(work,'program.zip'),payload);
      const files=[];
      async function walk(dir,prefix=''){
        for(const entry of await readdir(dir,{withFileTypes:true})){
          const path=join(dir,entry.name),name=prefix+entry.name;
          if(entry.isSymbolicLink())throw Error('程序包不允许链接');
          if(entry.isDirectory())await walk(path,name+'/');else files.push(name);
        }
      }
      await walk(payload);
      if(files.length!==Object.keys(this.manifest.program.files).length)throw Error('程序包文件数量不符');
      for(const name of files){
        const expected=this.manifest.program.files[name];
        if(!expected||!programFile(name))throw Error('程序包包含非程序文件');
        const data=await readFile(join(payload,name));
        if(data.length!==expected.bytes||createHash('sha256').update(data).digest('hex')!==expected.sha256)throw Error('程序文件校验失败');
      }
      if(this.disposed)throw Error('插件已停用');
      await this.stop();stopped=true;this.message='校验通过，正在安装并重启守岸人…';
      await atomicJson(join(work,'manifest.json'),this.manifest.program);
      await atomicJson(join(work,'job.json'),{id,root:this.root,pid:0,parent_stopped:true,current_version:current,target_version:this.manifest.version});
      const child=this.spawnProcess(join(payload,'tools','shorekeeper-updater.exe'),['--job',join(work,'job.json')],{
        cwd:work,windowsHide:true,stdio:'ignore',env:{...process.env,DSH_HOME:this.home,SHOREKEEPER_HARNESS_MANAGED:'1'},
      });
      await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
      const result=await json(join(work,'result.json'));
      if(result.status!=='success')throw Error(result.message||'更新未完成，已保留旧版');
      this.message='已更新并重启守岸人，个人配置和素材已保留';
    }catch(error){
      this.message=error.message||'更新未完成';
      // The helper rolls back failed starts. If handoff itself failed, resume
      // the existing program instead of leaving the companion closed.
      if(stopped&&!this.disposed){this.busy=false;await this.start().catch(()=>{});this.message=error.message;}
      throw error;
    }finally{
      this.busy=false;this.progress=null;
      // Only this operation's private extracted package is removed.
      if(!await exists(join(this.root,'.update-transaction.json')))await rm(work,{recursive:true,force:true}).catch(()=>{});
    }
  }
  async autoStart(){if((await this.settings()).launch_with_deepseek===true&&(await this.status()).installed)await this.start();}
  async dispose(){this.disposed=true;this.abort.abort();if((await this.settings()).exit_with_deepseek!==false)await this.stop().catch(()=>{});}
}
