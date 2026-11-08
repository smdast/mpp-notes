import type {ScrollDirection} from "./scrolling";
export const smoothStep = (current: number, target: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-Math.min(dt, 40) / 65));
export function inertiaStep(velocity: number, dt: number) {
  const decay = Math.exp(-Math.min(dt, 40) / 260);
  return { velocity: velocity * decay, delta: velocity * 260 * (1 - decay) };
}
export class ScrollMotion {
  private frame = 0;
  private previous = 0;
  private targetX = 0;
  private targetY = 0;
  private positionX = 0;
  private positionY = 0;
  private vx = 0;
  private vy = 0;
  private kind: "ease" | "inertia" = "ease";
  constructor(
    private element: HTMLElement,
    private reduced = () =>
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    private direction:()=>ScrollDirection=()=>"vertical",
  ) {
    element.addEventListener("wheel", this.wheel, { passive: false });
    document.addEventListener("visibilitychange", this.stop);
  }
  stop = () => {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.previous = 0;
  };
  destroy() {
    this.stop();
    this.element.removeEventListener("wheel", this.wheel);
    document.removeEventListener("visibilitychange", this.stop);
  }
  private bounds() {
    return {
      x: Math.max(0, this.element.scrollWidth - this.element.clientWidth),
      y: Math.max(0, this.element.scrollHeight - this.element.clientHeight),
    };
  }
  private wheel = (event: WheelEvent) => {
    const remap=this.direction()==="horizontal"&&event.deltaX===0&&event.deltaY!==0&&!event.shiftKey;
    const precise=event.deltaMode===0&&Math.abs(event.deltaY)<40&&Math.abs(event.deltaX)<40;
    if(event.ctrlKey||event.metaKey||(!remap&&(this.reduced()||precise))){
      this.stop();
      return;
    }
    event.preventDefault();
    const factor =
      event.deltaMode === 1
        ? 18
        : event.deltaMode === 2
          ? (remap?this.element.clientWidth:this.element.clientHeight)
          : 1;
    const active = this.frame && this.kind === "ease";
    const x = active ? this.targetX : this.element.scrollLeft,
      y = active ? this.targetY : this.element.scrollTop;
    if(remap&&precise){
      this.stop();
      this.element.scrollLeft+=event.deltaY;
      return;
    }
    this.easeTo(x + (remap?event.deltaY:event.deltaX) * factor, y + (remap?0:event.deltaY) * factor);
  };
  easeTo(x: number, y: number) {
    const max = this.bounds();
    this.targetX = Math.max(0, Math.min(max.x, x));
    this.targetY = Math.max(0, Math.min(max.y, y));
    if (this.reduced()) {
      this.stop();
      this.element.scrollLeft = this.targetX;
      this.element.scrollTop = this.targetY;
      return;
    }
    if(!this.frame||this.kind!=="ease"){
      this.positionX=this.element.scrollLeft;
      this.positionY=this.element.scrollTop;
    }
    this.kind = "ease";
    this.start();
  }
  fling(vx: number, vy: number) {
    if (this.reduced()) return;
    this.stop();
    this.vx = Math.max(-2.5, Math.min(2.5, vx));
    this.vy = Math.max(-2.5, Math.min(2.5, vy));
    if (Math.hypot(this.vx, this.vy) < 0.08) return;
    this.kind = "inertia";
    this.start();
  }
  private start() {
    if (!this.frame) {
      this.previous = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    }
  }
  private tick = (now: number) => {
    const dt = Math.min(40, now - this.previous || 16);
    this.previous = now;
    const e = this.element;
    if (this.kind === "ease") {
      // Accumulate fractional steps even when the browser rounds scroll offsets.
      this.positionX=smoothStep(this.positionX,this.targetX,dt);
      this.positionY=smoothStep(this.positionY,this.targetY,dt);
      e.scrollLeft=this.positionX;
      e.scrollTop=this.positionY;
      if (
        Math.abs(this.positionX-this.targetX)<0.5 &&
        Math.abs(this.positionY-this.targetY)<0.5
      ) {
        e.scrollLeft = this.targetX;
        e.scrollTop = this.targetY;
        this.stop();
        return;
      }
    } else {
      const x = inertiaStep(this.vx, dt),
        y = inertiaStep(this.vy, dt),
        max = this.bounds(),
        beforeX = e.scrollLeft,
        beforeY = e.scrollTop;
      e.scrollLeft += x.delta;
      e.scrollTop += y.delta;
      this.vx =
        e.scrollLeft <= 0 ||
        e.scrollLeft >= max.x ||
        Math.abs(e.scrollLeft - beforeX) < 0.01
          ? 0
          : x.velocity;
      this.vy =
        e.scrollTop <= 0 ||
        e.scrollTop >= max.y ||
        Math.abs(e.scrollTop - beforeY) < 0.01
          ? 0
          : y.velocity;
      if (Math.hypot(this.vx, this.vy) < 0.015) {
        this.stop();
        return;
      }
    }
    this.frame = requestAnimationFrame(this.tick);
  };
}
