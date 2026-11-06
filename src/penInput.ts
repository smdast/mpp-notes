export type SelectionButtonAction="eraser"|"lasso";
export type PenSignal={pointerType:string;button:number;buttons:number;pressure:number};
// Windows BARREL and ERASER are separate. Pointer Events exposes them as
// buttons bit 2 and bit 32 respectively; a mouse right-click is not a pen.
export function penButtonTool(e:PenSignal,selection:SelectionButtonAction):SelectionButtonAction|undefined{
  if(e.pointerType!=="pen")return;
  // `button=5` alone also describes a release; the state comes from `buttons`.
  if((e.buttons&32)!==0)return "eraser";
  if((e.buttons&2)!==0)return selection;
}
export function penInContact(e:PenSignal){return e.pointerType==="pen"&&(e.pressure>0||(e.buttons&1)!==0||(e.buttons&32)!==0);}
