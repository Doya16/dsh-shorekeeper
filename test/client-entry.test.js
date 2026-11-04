import test from 'node:test';
import assert from 'node:assert/strict';

// Runs the real client component with minimal hooks; no DOM is needed to inspect its output.
async function mount() {
  let loaded,Entry;
  const store=[];let cursor=0;
  const React={
    createElement:(type,props,...children)=>({type,props:props||{},children}),
    useState(initial){const i=cursor++;if(!(i in store))store[i]=initial;return [store[i],value=>{store[i]=value;}];},
    useEffect(){},Fragment:'fragment',
  };
  globalThis.window={__ModuleLoader__:{load(module){loaded=module;}}};
  globalThis.document={createElement:()=>({remove(){}}),head:{appendChild(){}}};
  await import(`../lib/client.js?${Math.random()}`);
  const plugin=loaded.factory(()=>React);
  plugin.apply({effect:fn=>fn(),slots:{
    inject:(_,fn)=>fn(),
    register:(_,component)=>{Entry=component;return ()=>{};},
  }});
  const render=(state,props={})=>{cursor=0;Entry(props);store[1]=state;cursor=0;return Entry(props);};
  return {render};
}
function flatten(node,out=[]) {
  if(node===null||node===undefined||node===false)return out;
  if(typeof node==='string'){out.push(node);return out;}
  if(Array.isArray(node)){for(const child of node)flatten(child,out);return out;}
  out.push(node);flatten(node.children,out);return out;
}
const buttons=tree=>flatten(tree).filter(n=>n.type==='button');
const label=b=>flatten(b.children).filter(n=>typeof n==='string').join('');
const button=(tree,text)=>buttons(tree).find(b=>label(b)===text);
const base={supported:true,installed:true,running:true,busy:false,progress:null,message:'',version:'1.1.1',targetVersion:'1.2.2',source:'auto',token:'t'};

test('a hidden entry stays hidden when no update is needed',async()=>{
  const {render}=await mount();
  assert.equal(render({...base,version:'1.2.2',needsUpdate:false,entryHidden:true}),null);
});

test('a hidden entry opens with the update button when the program is older',async()=>{
  const {render}=await mount();
  const tree=render({...base,needsUpdate:true,entryHidden:true});
  assert.equal(tree.children[0].type,'section');
  assert.ok(button(tree,'更新并重启守岸人'));
  assert.equal(button(tree,'显示部署入口'),undefined);
  assert.ok(flatten(tree).some(n=>typeof n==='string'&&n.includes('请忽略它')));
});

test('collapsing the prompt leaves a button that can reopen it',async()=>{
  const {render}=await mount();
  const state={...base,needsUpdate:true,entryHidden:true};
  button(render(state),'收起面板').props.onClick();
  const collapsed=render(state);
  assert.equal(collapsed.children[0].props['aria-label'],'打开守岸人桌宠入口');
  collapsed.children[0].props.onClick();
  assert.ok(button(render(state),'更新并重启守岸人'));
});

test('the entry hides again once the update has finished',async()=>{
  const {render}=await mount();
  assert.ok(render({...base,needsUpdate:true,entryHidden:true}));
  assert.equal(render({...base,version:'1.2.2',needsUpdate:false,entryHidden:true}),null);
});

test('the settings page keeps its entry controls and does not depend on the prompt',async()=>{
  const {render}=await mount();
  const tree=render({...base,needsUpdate:true,entryHidden:true},{settingsPage:true});
  assert.ok(button(tree,'更新并重启守岸人'));
  assert.ok(button(tree,'显示部署入口'));
  assert.equal(button(tree,'收起面板'),undefined);
});
