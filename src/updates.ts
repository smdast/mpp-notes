export async function checkAppUpdate(registration: ServiceWorkerRegistration, waitMs = 15000): Promise<"available"|"current"|"preparing"> {
 await registration.update();
 if(registration.waiting)return "available";
 const worker=registration.installing;
 if(!worker)return "current";
 return new Promise(resolve=>{
  const finish=(result:"available"|"current"|"preparing")=>{clearTimeout(timer);worker.removeEventListener("statechange",changed);resolve(result);};
  const changed=()=>{if(worker.state==="installed"||worker.state==="activated")finish(registration.waiting?"available":"current");else if(worker.state==="redundant")finish("preparing");};
  const timer=setTimeout(()=>finish("preparing"),waitMs);
  worker.addEventListener("statechange",changed);changed();
 });
}
export function validVersion(value:unknown):value is string {
 return typeof value==="string"&&/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)&&value.split(".").every(part=>Number.isSafeInteger(Number(part)));
}
export function isNewerVersion(candidate:string,current:string){
 if(!validVersion(candidate)||!validVersion(current))return false;
 const a=candidate.split(".").map(Number),b=current.split(".").map(Number);
 for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;
}
export async function fetchReleaseVersion(base:string){
 const url=new URL("version.json",base);url.searchParams.set("t",String(Date.now()));
 const response=await fetch(url,{cache:"no-store"});if(!response.ok)throw new Error("更新情報を取得できません。");
 const value=await response.json();if(value?.format!=="mpp-notes-release"||!validVersion(value.version))throw new Error("更新情報の形式が無効です。");return value.version as string;
}
export function serviceWorkerVersion(worker:Pick<ServiceWorker,"postMessage">,timeoutMs=1500):Promise<string|undefined>{
 return new Promise(resolve=>{
  const channel=new MessageChannel();
  const finish=(version?:string)=>{clearTimeout(timer);channel.port1.close();channel.port2.close();resolve(version);};
  const timer=setTimeout(()=>finish(),timeoutMs);
  channel.port1.onmessage=event=>finish(event.data?.format==="mpp-notes-release"&&validVersion(event.data.version)?event.data.version:undefined);
  try{worker.postMessage({type:"MPP_NOTES_VERSION"},[channel.port2]);}catch{finish();}
 });
}
export async function pendingReleaseVersion(registration:ServiceWorkerRegistration|undefined,base:string){
 const worker=registration?.waiting||registration?.installing;
 const version=worker?await serviceWorkerVersion(worker):undefined;
 return version||await fetchReleaseVersion(base);
}
