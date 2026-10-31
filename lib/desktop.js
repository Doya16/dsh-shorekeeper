// Windows full desktop runtime. No postinstall hooks; download/launch follows a
// button click, or the user's persisted launch-with-Harness preference.
import {mkdir, readFile, writeFile, rename, rm, cp, stat, lstat} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {join, dirname} from 'node:path';
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
export class DesktopManager {
  constructor(home,manifest,{platform=process.platform,arch=process.arch,spawnProcess=spawn,download=downloadRuntime,extract=extractRuntime}={}) {
    this.home=home;this.base=join(home,'shorekeeper-market');this.root=join(this.base,'app');
    this.manifest=manifest;this.supported=platform==='win32'&&arch==='x64';
    this.spawnProcess=spawnProcess;this.download=download;this.extract=extract;
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
    return {supported:this.supported,installed,running,busy:this.busy,progress:this.progress,
      message:this.message,version:info.version||'',targetVersion:this.manifest.version,
      needsUpdate:installed&&info.version!==this.manifest.version,source:prefs.source||'auto',
      megabytes:Math.ceil(this.manifest.bytes/1024/1024)};
  }
  async command(command) {
    if (!['close','show','hide','settings'].includes(command)) throw new Error('无效操作');
    await atomicJson(join(this.root,'harness-command.json'),{command,time:Date.now()/1000,id:randomUUID()});
  }
  async start(settings=false) {
    if (!this.supported) throw new Error('完整版需要 Windows 10/11 x64 本机 Harness');
    if (this.disposed||this.busy) throw new Error('请等待当前操作完成');
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
  async autoStart(){if((await this.settings()).launch_with_deepseek===true&&(await this.status()).installed)await this.start();}
  async dispose(){this.disposed=true;this.abort.abort();if((await this.settings()).exit_with_deepseek!==false)await this.stop().catch(()=>{});}
}
