import {useCallback, useEffect, useRef, useState} from 'react';
import type {SetStateAction} from 'react';
export type Personal={read:string[];saved:string[];following:string[];notes:Record<string,string>;lastVisit:string};
type User={id:string;name:string;email:string};
const empty=():Personal=>({read:[],saved:[],following:[],notes:{},lastVisit:''});
type Changes=Partial<Record<'read'|'saved'|'following',{add:string[];remove:string[]}>>&{notes?:Record<string,string>;lastVisit?:string};
function diff(a:Personal,b:Personal):Changes {
 const out:Changes={};
 for(const key of ['read','saved','following'] as const){const add=b[key].filter(x=>!a[key].includes(x)),remove=a[key].filter(x=>!b[key].includes(x));if(add.length||remove.length)out[key]={add,remove};}
 const notes:Record<string,string>={};for(const key of new Set([...Object.keys(a.notes),...Object.keys(b.notes)])){if(a.notes[key]!==b.notes[key])notes[key]=b.notes[key]||'';}if(Object.keys(notes).length)out.notes=notes;
 if(a.lastVisit!==b.lastVisit)out.lastVisit=b.lastVisit;
 return out;
}
export function useAccount(){
 const [user,setUser]=useState<User|null>(null),[personal,render]=useState<Personal>(empty),[status,setStatus]=useState('正在检查登录状态…');
 const account=useRef<User|null>(null),data=useRef<Personal>(empty()),queue=useRef<{user:string;changes:Changes}[]>([]),running=useRef(false),ready=useRef(false);
 const flush=useCallback(async()=>{
  if(running.current)return false;running.current=true;
  try{while(queue.current.length){const item=queue.current[0]!;setStatus('正在保存…');const r=await fetch('/harness/api/personal',{method:'POST',headers:{'Content-Type':'application/json','X-Harness-Request':'1','X-Harness-Account':item.user},body:JSON.stringify(item.changes)});if(!r.ok)throw Error(r.status===409?'账号已切换，请导出未保存记录后刷新':r.status===401?'登录已过期，请导出未保存记录后重新登录':'保存未完成，请点击重试');queue.current.shift();}setStatus('已私密同步');return true;}catch(e){setStatus(e instanceof Error?e.message:'保存失败，请重试');return false;}finally{running.current=false;}
 },[]);
 const refresh=useCallback(async()=>{
  if(queue.current.length||running.current)return;
  try{const r=await fetch('/harness/api/session',{cache:'no-store'});if(!r.ok)throw Error();const value=await r.json();if(queue.current.length||running.current)return;account.current=value.user;setUser(value.user);data.current=value.personal;render(value.personal);ready.current=true;setStatus(value.user?'已私密同步':'登录后私密同步');}catch{setStatus('账号服务暂不可用，点击重试');}
 },[]);
 useEffect(()=>{void refresh();const focus=()=>{void refresh()};window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus)},[refresh]);
 useEffect(()=>{const leave=(e:BeforeUnloadEvent)=>{if(queue.current.length){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave)},[]);
 const login=()=>{if(queue.current.length){setStatus('请先导出未保存记录，再刷新并登录');return;}location.assign('/harness/api/auth/start');};
 const setPersonal=useCallback((action:SetStateAction<Personal>)=>{
  if(!account.current){if(ready.current)location.assign('/harness/api/auth/start');return;}
  const next=typeof action==='function'?action(data.current):action;const changes=diff(data.current,next);data.current=next;render(next);
  if(Object.keys(changes).length){queue.current.push({user:account.current.id,changes});void flush();}
 },[flush]);
 const logout=async()=>{try{if(queue.current.length||running.current){setStatus('请等保存完成，或重试后再退出');return;}const r=await fetch('/harness/api/logout',{method:'POST',headers:{'X-Harness-Request':'1','X-Harness-Account':account.current?.id||''}});if(!r.ok){setStatus('退出失败，请重试');return;}account.current=null;data.current=empty();setUser(null);render(empty());setStatus('登录后私密同步');}catch{setStatus('退出失败，请重试');}};
 return {user,personal,setPersonal,status,login,logout,retry:()=>queue.current.length?flush():refresh()};
}
