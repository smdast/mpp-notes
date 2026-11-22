// One observer per notebook, with the latest entry winning when a fast scroll
// crosses an entire page before the browser delivers the notification batch.
type Pool={observer:IntersectionObserver;callbacks:Map<Element,(visible:boolean)=>void>;deferred:Map<Element,boolean>;settled:()=>void};
const pools=new WeakMap<HTMLElement,Pool>();
export function observePage(root:HTMLElement,element:Element,onVisible:(visible:boolean)=>void){
 let pool=pools.get(root);
 if(!pool){
  const callbacks=new Map<Element,(visible:boolean)=>void>(),deferred=new Map<Element,boolean>();
  const observer=new IntersectionObserver(entries=>{
   const latest=new Map<Element,boolean>();for(const entry of entries)latest.set(entry.target,entry.isIntersecting);
   for(const [target,visible] of latest){
    if(root.classList.contains("zooming"))deferred.set(target,visible);
    else{deferred.delete(target);callbacks.get(target)?.(visible);}
   }
  },{root,rootMargin:"600px"});
  const settled=()=>{for(const [target,visible] of deferred)callbacks.get(target)?.(visible);deferred.clear();};
  pool={observer,callbacks,deferred,settled};pools.set(root,pool);root.addEventListener("notebook-zoom-settled",settled);
 }
 pool.callbacks.set(element,onVisible);pool.observer.observe(element);
 return ()=>{
  pool!.observer.unobserve(element);pool!.callbacks.delete(element);pool!.deferred.delete(element);
  if(!pool!.callbacks.size){pool!.observer.disconnect();root.removeEventListener("notebook-zoom-settled",pool!.settled);pools.delete(root);}
 };
}
