export type ToolbarPlacement={mode:"docked"|"floating";x:number;y:number};
export const defaultToolbarPlacement=():ToolbarPlacement=>({mode:"docked",x:16,y:84});
export function readToolbarPlacement(value:unknown):ToolbarPlacement{
 if(!value||typeof value!=="object")return defaultToolbarPlacement();
 const p=value as Partial<ToolbarPlacement>;
 return (p.mode==="docked"||p.mode==="floating")&&typeof p.x==="number"&&Number.isFinite(p.x)&&p.x>=0&&p.x<=100000&&typeof p.y==="number"&&Number.isFinite(p.y)&&p.y>=0&&p.y<=100000
  ?{mode:p.mode,x:p.x,y:p.y}:defaultToolbarPlacement();
}
export function clampToolbarPosition(point:{x:number;y:number},size:{width:number;height:number},viewport:{width:number;height:number}){
 const margin=8;
 return {x:Math.max(margin,Math.min(point.x,viewport.width-size.width-margin)),y:Math.max(margin,Math.min(point.y,viewport.height-size.height-margin))};
}
