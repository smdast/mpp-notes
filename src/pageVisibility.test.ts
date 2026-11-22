import {it,expect,vi,afterEach} from "vitest";
import {observePage} from "./pageVisibility";
let observers:MockObserver[]=[];
class MockObserver {
 observe=vi.fn();unobserve=vi.fn();disconnect=vi.fn();
 constructor(public callback:IntersectionObserverCallback){observers.push(this);}
 send(entries:{target:Element;isIntersecting:boolean}[]){this.callback(entries as IntersectionObserverEntry[],this as unknown as IntersectionObserver);}
}
function setup(){
 observers=[];vi.stubGlobal("IntersectionObserver",MockObserver);
 const root=Object.assign(new EventTarget(),{classList:{contains:vi.fn(()=>false)}}) as unknown as HTMLElement;
 return root;
}
afterEach(()=>vi.unstubAllGlobals());
it("shares one observer across hundreds of pages and uses the final visibility entry",()=>{
 const root=setup(),pages=Array.from({length:200},()=>({} as Element)),callbacks=pages.map(()=>vi.fn());
 const releases=pages.map((page,i)=>observePage(root,page,callbacks[i]));expect(observers).toHaveLength(1);
 observers[0].send([{target:pages[35],isIntersecting:true},{target:pages[35],isIntersecting:false},{target:pages[99],isIntersecting:true}]);
 expect(callbacks[35]).toHaveBeenCalledExactlyOnceWith(false);expect(callbacks[99]).toHaveBeenCalledExactlyOnceWith(true);
 releases.forEach(release=>release());expect(observers[0].disconnect).toHaveBeenCalledOnce();
});
it("defers zoom visibility changes, discards removed pages, and flushes only their latest state",()=>{
 const root=setup(),a={} as Element,b={} as Element,first=vi.fn(),second=vi.fn();
 const releaseA=observePage(root,a,first),releaseB=observePage(root,b,second);vi.mocked(root.classList.contains).mockReturnValue(true);
 observers[0].send([{target:a,isIntersecting:true},{target:b,isIntersecting:true}]);observers[0].send([{target:b,isIntersecting:false}]);
 expect(first).not.toHaveBeenCalled();releaseA();root.dispatchEvent(new Event("notebook-zoom-settled"));
 expect(first).not.toHaveBeenCalled();expect(second).toHaveBeenCalledExactlyOnceWith(false);releaseB();
});
