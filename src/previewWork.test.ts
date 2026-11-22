import {it,expect,vi,afterEach} from "vitest";
import {PreviewWork} from "./previewWork";
afterEach(()=>vi.useRealTimers());
it("defers previews throughout consecutive strokes and cancels obsolete work",()=>{
 vi.useFakeTimers();const queue=new PreviewWork(),old=vi.fn(),fresh=vi.fn();
 const cancel=queue.schedule(old);queue.setWriting(true);vi.advanceTimersByTime(2000);expect(old).not.toHaveBeenCalled();
 queue.setWriting(false);vi.advanceTimersByTime(300);queue.setWriting(true);cancel();queue.schedule(fresh);
 vi.advanceTimersByTime(1000);expect(fresh).not.toHaveBeenCalled();queue.setWriting(false);
 vi.advanceTimersByTime(449);expect(fresh).not.toHaveBeenCalled();vi.advanceTimersByTime(1);expect(fresh).toHaveBeenCalledOnce();expect(old).not.toHaveBeenCalled();
});
it("spreads queued previews across tasks and pauses again when input resumes",()=>{
 vi.useFakeTimers();const queue=new PreviewWork(),a=vi.fn(),b=vi.fn();queue.schedule(a);queue.schedule(b);
 vi.advanceTimersByTime(450);expect(a).toHaveBeenCalledOnce();expect(b).not.toHaveBeenCalled();
 queue.setWriting(true);vi.advanceTimersByTime(1000);expect(b).not.toHaveBeenCalled();queue.setWriting(false);
 vi.advanceTimersByTime(450);expect(b).toHaveBeenCalledOnce();
});
