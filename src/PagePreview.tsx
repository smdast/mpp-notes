import {useEffect,useRef,useState} from "react";
import type {PDFDocumentProxy} from "pdfjs-dist";
import type {Page} from "./model";
import {drawPaper,drawStroke} from "./draw";
import {prepareImages,loadInkImage} from "./images";
import {pagePaperColor} from "./paper";
export function PagePreview({page,dark,pdfDocument,number}:{page:Page;dark:boolean;pdfDocument?:PDFDocumentProxy;number:number}){
 const host=useRef<HTMLSpanElement>(null),[visible,setVisible]=useState(false),[src,setSrc]=useState(""),[failed,setFailed]=useState(false);
 useEffect(()=>{const observer=new IntersectionObserver(entries=>setVisible(entries[0].isIntersecting),{rootMargin:"300px"});if(host.current)observer.observe(host.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{
  if(!visible)return;
  let disposed=false,render:ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>|undefined;
  setFailed(false);
  if(page.pdfIndex!==undefined&&!pdfDocument){setSrc("");return;}
  void(async()=>{try{
   const canvas=document.createElement("canvas"),scale=Math.min(320/page.width,480/page.height);
   canvas.width=Math.max(1,Math.ceil(page.width*scale));canvas.height=Math.max(1,Math.ceil(page.height*scale));
   const ctx=canvas.getContext("2d")!;
   const images=await prepareImages(page.strokes);
   if(page.backgroundImage&&page.pdfIndex===undefined)images.push(await loadInkImage(page.backgroundImage));
   if(disposed)return;
   ctx.setTransform(canvas.width/page.width,0,0,canvas.height/page.height,0,0);
   drawPaper(ctx,page,pagePaperColor(page,dark));
   if(page.pdfIndex!==undefined&&pdfDocument){
    const pdf=await pdfDocument.getPage(page.pdfIndex+1);if(disposed)return;
    const viewport=pdf.getViewport({scale});canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    render=pdf.render({canvas,canvasContext:ctx,viewport});await render.promise;
    ctx.setTransform(canvas.width/page.width,0,0,canvas.height/page.height,0,0);
   }
   if(disposed)return;
   page.strokes.forEach(s=>drawStroke(ctx,s));setSrc(canvas.toDataURL("image/png"));
  }catch{if(!disposed){setSrc("");setFailed(true);}}})();
  return()=>{disposed=true;render?.cancel();};
 },[page,dark,pdfDocument,visible]);
 return <span ref={host} className="page-image-preview" style={{aspectRatio:`${page.width} / ${page.height}`,background:pagePaperColor(page,dark)}}>{src?<img src={src} alt={`ページ ${number} のプレビュー`} draggable={false}/>:<span>{failed?"表示できません":`ページ ${number}`}</span>}</span>;
}
