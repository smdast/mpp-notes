import {drawStroke} from "./draw";
import {uid,type Page,type Point,type Stroke} from "./model";

export type FillSettings = {color:string; opacity:number};
export const defaultFill:FillSettings = {color:"#376fac",opacity:1};

export function enclosedRegion(mask:Uint8ClampedArray,width:number,height:number,x:number,y:number){
  const start=y*width+x;
  if(x<0||x>=width||y<0||y>=height||mask[start*4+3]>=24)return;
  const queue=new Int32Array(width*height);
  let count=0,left=x,right=x,top=y,bottom=y;
  const visit=(index:number)=>{
    if(mask[index*4+3]>=24)return;
    mask[index*4+3]=255;
    queue[count++]=index;
  };
  visit(start);
  for(let head=0;head<count;head++){
    const index=queue[head],column=index%width,row=Math.floor(index/width);
    if(column===0||column===width-1||row===0||row===height-1)return;
    left=Math.min(left,column);right=Math.max(right,column);
    top=Math.min(top,row);bottom=Math.max(bottom,row);
    visit(index-1);visit(index+1);visit(index-width);visit(index+width);
  }
  return {indices:queue.subarray(0,count),left,top,width:right-left+1,height:bottom-top+1};
}

export function fillStroke(page:Page,point:Point,{color,opacity}:FillSettings):Stroke|undefined {
  if(!page.strokes.some(stroke=>!stroke.image))return;
  const scale=Math.min(2,4096/Math.max(page.width,page.height),Math.sqrt(4_000_000/(page.width*page.height)));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.floor(page.width*scale));
  canvas.height=Math.max(1,Math.floor(page.height*scale));
  const sx=canvas.width/page.width,sy=canvas.height/page.height;
  const context=canvas.getContext("2d",{willReadFrequently:true})!;
  context.scale(sx,sy);
  for(const stroke of page.strokes){
    if(!stroke.image)drawStroke(context,{...stroke,opacity:1});
  }
  const mask=context.getImageData(0,0,canvas.width,canvas.height);
  const region=enclosedRegion(mask.data,canvas.width,canvas.height,Math.floor(point.x*sx),Math.floor(point.y*sy));
  if(!region)return;

  const image=context.createImageData(region.width,region.height);
  const rgb=Number.parseInt(color.slice(1),16),alpha=Math.round(opacity*255);
  for(const index of region.indices){
    const x=index%canvas.width-region.left,y=Math.floor(index/canvas.width)-region.top;
    const offset=(y*region.width+x)*4;
    image.data[offset]=rgb>>16;
    image.data[offset+1]=(rgb>>8)&255;
    image.data[offset+2]=rgb&255;
    image.data[offset+3]=alpha;
  }
  canvas.width=region.width;
  canvas.height=region.height;
  context.putImageData(image,0,0);
  const left=region.left/sx,top=region.top/sy,right=left+region.width/sx,bottom=top+region.height/sy;
  return {id:uid(),tool:"pen",color,width:.05,image:canvas.toDataURL("image/png"),
    points:[{x:left,y:top,p:.5},{x:right,y:top,p:.5},{x:right,y:bottom,p:.5},{x:left,y:bottom,p:.5}]};
}
