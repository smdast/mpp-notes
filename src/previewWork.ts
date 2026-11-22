// Thumbnails are expendable background work; saving ink is not delayed.
export class PreviewWork {
  private tasks=new Set<()=>void>();
  private timer:ReturnType<typeof setTimeout>|undefined;
  private writing=false;
  constructor(private delay=450){}
  setWriting(writing:boolean){
    this.writing=writing;clearTimeout(this.timer);this.timer=undefined;
    if(!writing)this.arm();
  }
  schedule(task:()=>void){
    this.tasks.add(task);this.arm();
    return ()=>{this.tasks.delete(task);if(!this.tasks.size){clearTimeout(this.timer);this.timer=undefined;}};
  }
  private arm(wait=this.delay){
    if(this.writing||this.timer!==undefined||!this.tasks.size)return;
    this.timer=setTimeout(()=>{
      this.timer=undefined;
      const task=this.tasks.values().next().value;
      if(!task)return;
      this.tasks.delete(task);try{task();}finally{this.arm(16);}
    },wait);
  }
}
export const previewWork=new PreviewWork();
