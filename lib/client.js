// This entry opens the full Windows app; it does not replace the pet with a reduced overlay.
window.__ModuleLoader__.load({id:'dsh-shorekeeper',factory(require){
  const React=require('react'),h=React.createElement;
  const {useState,useEffect}=React;
  const CSS=`.sk-full{position:fixed;right:18px;bottom:72px;z-index:10000;font:15px/1.6 system-ui,'Microsoft YaHei',sans-serif;color:#eaf5ff;pointer-events:auto}.sk-full *{box-sizing:border-box}.sk-full button,.sk-full select{font:inherit;color:inherit;background:#274767;border:1px solid #6c91b0;border-radius:10px;padding:8px 12px;cursor:pointer}.sk-full button:disabled{opacity:.5;cursor:default}.sk-full .sk-card{width:min(410px,calc(100vw - 32px));max-height:calc(100vh - 110px);overflow:auto;background:#172c43;border:1px solid #6b9bc3;border-radius:18px;padding:22px;box-shadow:0 10px 45px #0008}.sk-full h2{font-size:22px;margin:0 0 12px}.sk-full p{margin:8px 0 14px}.sk-full .sk-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.sk-full .sk-open{display:flex;align-items:center;gap:8px;background:#172c43}.sk-full img{width:32px;height:32px}.sk-full .sk-info{font-size:13px;color:#bfd4e9}.sk-full .sk-error{color:#ffd2c5;white-space:pre-wrap}.sk-full select{width:100%;margin-top:6px}.sk-full progress{width:100%}`;
  function Entry(){
    const[open,setOpen]=useState(false),[state,setState]=useState(null),[error,setError]=useState(''),[source,setSource]=useState('auto'),[working,setWorking]=useState(false);
    useEffect(()=>{
      const abort=new AbortController();let active=true,fetching=false;
      async function poll(){if(fetching)return;fetching=true;try{
        const r=await fetch('shorekeeper-full/status',{credentials:'same-origin',signal:abort.signal});
        if(!r.ok)throw Error('无法连接桌宠插件');const value=await r.json();if(active)setState(value);
      }catch(e){if(active)setError(e.message);}finally{fetching=false;}}
      void poll();const timer=setInterval(poll,1000);return()=>{active=false;abort.abort();clearInterval(timer);};
    },[]);
    async function act(action){
      setWorking(true);setError('');try{
        const r=await fetch('shorekeeper-full/action',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-shorekeeper-token':state.token},body:JSON.stringify({action,source})});
        const result=await r.json();if(!r.ok)throw Error(result.error||'操作失败');
      }catch(e){setError(e.message);}finally{setWorking(false);}
    }
    const busy=working||state?.busy;
    return h('div',{className:'sk-full'},open?h('section',{className:'sk-card','aria-label':'守岸人桌宠完整版'},
      h('h2',null,'守岸人 · 完整版'),
      h('p',null,'自选 GIF、语音字幕、播放规则、字体大小、锁定穿透和配置迁移，都在原来的桌宠设置里。'),
      h('p',{className:'sk-info'},'Windows 10/11 x64 · 本机 Harness。桌宠可在桌面任意位置陪伴，保留三套 83 个 GIF、40 个音频和两款字体。'),
      !state?h('p',null,'正在连接…'):!state.supported?h('p',{className:'sk-error'},'此版本需要在 Windows x64 电脑上运行 Harness。'):h(React.Fragment,null,
        h('p',null,state.installed?`已安装 v${state.version}${state.running?' · 运行中':' · 已关闭'}`:`首次下载约 ${state.megabytes} MB，无需安装 Python。`),
        (!state.installed||state.needsUpdate)?h('label',null,'下载来源',h('select',{value:source,onChange:e=>setSource(e.target.value),disabled:busy},h('option',{value:'auto'},'自动选择'),h('option',{value:'github'},'GitHub 官方源'),h('option',{value:'mirror'},'镜像加速（GH-Proxy）'))):null,
        state.needsUpdate?h('p',null,`可安装 v${state.targetVersion}，更新前会保留现有配置与素材。`):null,
        state.busy?h('progress',{value:state.progress??0,max:100,'aria-label':'下载进度'}):null,
        state.message?h('p',{role:'status'},state.message):null,
        h('div',{className:'sk-actions'},
          (!state.installed||state.needsUpdate)?h('button',{disabled:busy,onClick:()=>act('install')},state.installed?'更新完整版':'下载并安装完整版'):null,
          state.installed?h('button',{disabled:busy,onClick:()=>act('start')},state.running?'唤醒桌宠':'启动桌宠'):null,
          state.installed?h('button',{disabled:busy,onClick:()=>act('settings')},'打开完整设置'):null,
          state.running?h('button',{disabled:busy,onClick:()=>act('stop')},'关闭桌宠'):null)),
      error?h('p',{className:'sk-error',role:'alert'},error):null,
      h('p',{className:'sk-info'},'原独立版的配置素材 ZIP 可在「设置 → 保存与迁移」导入。个人素材保存在 Harness 数据目录，更新、卸载插件不会删除。'),
      h('button',{onClick:()=>setOpen(false)},'收起入口')
    ):h('button',{className:'sk-open',onClick:()=>setOpen(true),'aria-label':'打开守岸人桌宠入口'},h('img',{src:'shorekeeper-full/icon.png',alt:''}),'守岸人桌宠'));
  }
  function apply(ctx){ctx.effect(()=>{
    const style=document.createElement('style');style.textContent=CSS;document.head.appendChild(style);
    const dispose=ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'shorekeeper-full',inject:()=>({})},Entry));
    return()=>{dispose?.();style.remove();};
  },'shorekeeper: full desktop entry');}
  return {apply,inject:['slots']};
}});
