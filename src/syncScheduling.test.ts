import {it,expect} from "vitest";
import {SyncActivity,SYNC_IDLE_MS,SYNC_POLL_MS,syncCheckpoint} from "./syncScheduling";
import {SyncRetry} from "./drive/sync";
it("waits for ten quiet seconds, resetting the window on every interaction",()=>{
  let time=0;const activity=new SyncActivity(()=>time);
  time=9999;expect(activity.isIdle()).toBe(false);time=10000;expect(activity.isIdle()).toBe(true);
  activity.record();expect(activity.version).toBe(1);time+=9999;expect(activity.isIdle()).toBe(false);time++;expect(activity.isIdle()).toBe(true);
  expect(SYNC_IDLE_MS).toBe(10000);expect(SYNC_POLL_MS).toBe(120000);
});
it("lets pending input cancel a sync between asynchronous stages without a committed stroke",async()=>{
  let time=10000;const activity=new SyncActivity(()=>time);time+=SYNC_IDLE_MS;
  const snapshot={notes:[],folders:[]},conditions=()=>({ready:true,canSync:()=>true,isIdle:()=>activity.isIdle(),activityVersion:()=>activity.version,snapshot});
  const checkpoint=syncCheckpoint(conditions);
  await expect(checkpoint()).resolves.toBeUndefined();
  const next=checkpoint();activity.record();await expect(next).rejects.toBeInstanceOf(SyncRetry);
  time+=SYNC_IDLE_MS;await expect(checkpoint()).resolves.toBeUndefined();
});
it("manual sync can begin immediately but yields to new input and pending local saves",async()=>{
  const activity=new SyncActivity(()=>0),snapshot={notes:[],folders:[]};let writable=true;
  const conditions=()=>({ready:true,canSync:()=>writable,isIdle:()=>false,activityVersion:()=>activity.version,snapshot});
  const checkpoint=syncCheckpoint(conditions,true);await expect(checkpoint()).resolves.toBeUndefined();
  activity.record();await expect(checkpoint()).rejects.toBeInstanceOf(SyncRetry);
  const next=syncCheckpoint(conditions,true);writable=false;await expect(next()).rejects.toBeInstanceOf(SyncRetry);
});
it("rejects stale snapshots and disabled transports even if the pen is lifted",async()=>{
  let snapshot={notes:[],folders:[]},enabled=true;
  const conditions=()=>({ready:true,canSync:()=>true,isIdle:()=>true,enabled,snapshot});
  const checkpoint=syncCheckpoint(conditions);snapshot={notes:[],folders:[]};await expect(checkpoint()).rejects.toBeInstanceOf(SyncRetry);
  const next=syncCheckpoint(conditions);enabled=false;await expect(next()).rejects.toBeInstanceOf(SyncRetry);
});
