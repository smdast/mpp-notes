import {it,expect,vi} from "vitest";
import {checkAppUpdate,isNewerVersion,fetchReleaseVersion,serviceWorkerVersion,pendingReleaseVersion} from "./updates";
const reg=(value:object)=>({update:vi.fn().mockResolvedValue(undefined),waiting:null,installing:null,...value}) as unknown as ServiceWorkerRegistration;
it("checks the network and distinguishes current and waiting releases",async()=>{
 const current=reg({});expect(await checkAppUpdate(current)).toBe("current");expect(current.update).toHaveBeenCalledOnce();
 expect(await checkAppUpdate(reg({waiting:{}}))).toBe("available");
});
it("waits for an installing worker and cleans up listeners",async()=>{
 const worker=Object.assign(new EventTarget(),{state:"installing"}),registration=reg({installing:worker});
 const remove=vi.spyOn(worker,"removeEventListener");
 const result=checkAppUpdate(registration,1000);
 setTimeout(()=>{Object.assign(registration,{waiting:worker});worker.state="installed";worker.dispatchEvent(new Event("statechange"));},0);
 expect(await result).toBe("available");expect(remove).toHaveBeenCalled();
});
it("does not claim a stalled or failed update is current",async()=>{
 const worker=Object.assign(new EventTarget(),{state:"installing"});
 expect(await checkAppUpdate(reg({installing:worker}),1)).toBe("preparing");
 await expect(checkAppUpdate(reg({update:()=>Promise.reject(new Error("offline"))}))).rejects.toThrow("offline");
});
it("compares release numbers numerically and rejects invalid metadata",async()=>{
 expect(isNewerVersion("1.17.0","1.9.9")).toBe(true);expect(isNewerVersion("1.17.0","1.17.0")).toBe(false);expect(isNewerVersion("unknown","1.17.0")).toBe(false);
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({format:"mpp-notes-release",version:"1.18.0"})));
 vi.stubGlobal("fetch",fetcher);
 try{expect(await fetchReleaseVersion("https://example.com/mpp-notes/")).toBe("1.18.0");expect(fetcher.mock.calls[0][0].href).toContain("/mpp-notes/version.json?");expect(fetcher.mock.calls[0][1]).toMatchObject({cache:"no-store"});
 fetcher.mockResolvedValue(new Response(JSON.stringify({version:"1.18.0"})));await expect(fetchReleaseVersion("https://example.com/mpp-notes/")).rejects.toThrow("形式");}finally{vi.unstubAllGlobals();}
});
it("shows the version of the waiting worker even when a newer server build exists",async()=>{
 const worker={postMessage:(_message:unknown,transfer:Transferable[])=>{(transfer[0] as MessagePort).postMessage({format:"mpp-notes-release",version:"1.18.0"});}} as unknown as ServiceWorker;
 const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
 try{expect(await pendingReleaseVersion(reg({waiting:worker}),"https://example.com/mpp-notes/")).toBe("1.18.0");expect(fetcher).not.toHaveBeenCalled();
 expect(await serviceWorkerVersion({postMessage:()=>{}},1)).toBeUndefined();}finally{vi.unstubAllGlobals();}
});
