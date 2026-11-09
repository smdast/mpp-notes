import type {Stroke} from "./model";

export type LineStyle="solid"|"dotted"|"dashed";
export type StrokeStylePatch={color?:string;width?:number;line?:LineStyle};

export function lineStyle(stroke:Pick<Stroke,"dashed"|"dotted">):LineStyle{
  return stroke.dashed?"dashed":stroke.dotted?"dotted":"solid";
}
export function lineFlags(line:LineStyle){
  return {dotted:line==="dotted",dashed:line==="dashed"};
}
export function applyStrokeStyle(strokes:Stroke[],selected:ReadonlySet<string>,patch:StrokeStylePatch){
  let changed=false;
  const next=strokes.map(stroke=>{
    if(stroke.image||!selected.has(stroke.id))return stroke;
    const {color=stroke.color,width=stroke.width,line}=patch;
    const changeLine=line!==undefined&&line!==lineStyle(stroke);
    if(color===stroke.color&&width===stroke.width&&!changeLine)return stroke;
    changed=true;
    return {...stroke,color,width,...(changeLine?lineFlags(line):{})};
  });
  return changed?next:strokes;
}
