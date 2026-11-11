import type {Stroke} from "./model";

export type LineStyle="solid"|"dotted"|"dashed";
export type StrokeStylePatch={color?:string;width?:number;line?:LineStyle};

export function lineStyle(stroke:Pick<Stroke,"dashed"|"dotted">):LineStyle{
  return stroke.dashed?"dashed":stroke.dotted?"dotted":"solid";
}
export function lineFlags(line:LineStyle){
  return {dotted:line==="dotted",dashed:line==="dashed"};
}
export function strokeSize(stroke:Pick<Stroke,"width"|"tool">){
  return Math.max(1,Math.round(stroke.width*(stroke.tool==="marker"?1:5)));
}

export function applyStrokeStyle(strokes:Stroke[],selected:ReadonlySet<string>,patch:StrokeStylePatch){
  let changed=false;
  const next=strokes.map(stroke=>{
    if(stroke.image||!selected.has(stroke.id))return stroke;
    const {color=stroke.color,width:size,line}=patch;
    const width=size===undefined?stroke.width:size/(stroke.tool==="marker"?1:5);
    const changeLine=line!==undefined&&line!==lineStyle(stroke);
    if(color===stroke.color&&width===stroke.width&&!changeLine)return stroke;
    changed=true;
    return {...stroke,color,width,...(changeLine?lineFlags(line):{})};
  });
  return changed?next:strokes;
}
