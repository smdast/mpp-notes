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
