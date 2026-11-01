import {it,expect,vi} from "vitest";
import {checkAppUpdate} from "./updates";
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
