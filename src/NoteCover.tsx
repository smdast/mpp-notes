import { useEffect, useRef, useState } from "react";
import type { Note } from "./model";
import { drawPaper, drawStroke } from "./draw";
import { prepareImages, loadInkImage } from "./images";
import { pagePaperColor } from "./paper";
import { pdfjs, pdfOptions } from "./pdf";
export function NoteCover({note,dark}:{note:Note;dark:boolean}) {
 const canvas=useRef<HTMLCanvasElement>(null);
 const [visible,setVisible]=useState(false);
 useEffect(()=>{if(!canvas.current)return;const observer=new IntersectionObserver(entries=>{if(entries[0].isIntersecting){setVisible(true);observer.disconnect();}},{rootMargin:"300px"});observer.observe(canvas.current);return()=>observer.disconnect();},[note.coverImage]);
 useEffect(()=>{
  if(note.coverImage || !visible) return;
  let disposed=false;
  const task=note.pdf && note.pages[0]?.pdfIndex !== undefined ? pdfjs.getDocument({...pdfOptions(),data:note.pdf.slice()}) : undefined;
  let render: {cancel:()=>void}|undefined;
  void(async()=>{try{
   const page=note.pages[0], c=canvas.current;
   if(!page||!c)return;
   const scale=Math.min(240/page.width,400/page.height);
   c.width=Math.max(1,Math.ceil(page.width*scale));c.height=Math.max(1,Math.ceil(page.height*scale));
   const ctx=c.getContext("2d")!;
   const images=await prepareImages(page.strokes);
   if(page.backgroundImage) images.push(await loadInkImage(page.backgroundImage));
   if(disposed)return;
   ctx.scale(c.width/page.width,c.height/page.height);
   drawPaper(ctx,page,pagePaperColor(page,dark));
   if(task&&page.pdfIndex!==undefined){const doc=await task.promise;const pdf=await doc.getPage(page.pdfIndex+1);if(disposed)return;const viewport=pdf.getViewport({scale});ctx.resetTransform();const job=pdf.render({canvas:c,canvasContext:ctx,viewport});render=job;await job.promise;ctx.setTransform(c.width/page.width,0,0,c.height/page.height,0,0);}
   if(!disposed)page.strokes.forEach(s=>drawStroke(ctx,s));
  }catch{if(!disposed&&canvas.current){const ctx=canvas.current.getContext("2d")!;ctx.fillStyle="#eef1ec";ctx.fillRect(0,0,240,400);ctx.fillStyle="#345d48";ctx.fillText("プレビューを表示できません",8,30);}}})();
  return()=>{disposed=true;render?.cancel();if(task)void task.destroy();};
 },[note.pages[0],note.pdf,note.coverImage,dark,visible]);
 return note.coverImage ? <img loading="lazy" className="cover-preview" src={note.coverImage} alt="選択した表紙"/> : <canvas className="cover-preview" ref={canvas} aria-label="1ページ目のプレビュー"/>;
}
