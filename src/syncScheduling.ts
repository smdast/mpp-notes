import {SyncRetry,type LibrarySnapshot} from "./drive/sync";

export const SYNC_IDLE_MS=10_000;
export const SYNC_POLL_MS=120_000;
export class SyncActivity {
  private last:number;
  version=0;
  constructor(private now=()=>performance.now()){this.last=now();}
  record(){this.last=this.now();this.version++;}
  isIdle(){return this.now()-this.last>=SYNC_IDLE_MS;}
}
type Conditions={enabled?:boolean;ready:boolean;canSync:()=>boolean;isIdle?:()=>boolean;activityVersion?:()=>number;snapshot:LibrarySnapshot};
export function syncCheckpoint(current:()=>Conditions,manual=false){
  const start=current(),version=start.activityVersion?.(),snapshot=start.snapshot;
  let lastYield=-Infinity;
  return async()=>{
    // Allow queued pointer input to run before another batch of background work.
    // Coalesce close-together checks to avoid one clamped timer per file/note.
    if(performance.now()-lastYield>=8){await new Promise<void>(resolve=>setTimeout(resolve,0));lastYield=performance.now();}
    else await Promise.resolve();
    const next=current();
    if(next.enabled===false||!next.ready||!next.canSync()||next.snapshot.notes!==snapshot.notes||next.snapshot.folders!==snapshot.folders||
      (manual?next.activityVersion?.()!==version:next.isIdle?.()===false))throw new SyncRetry();
  };
}
