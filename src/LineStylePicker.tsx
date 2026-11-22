import {SegmentedControl,SegmentedControlItem} from "@astryxdesign/core/SegmentedControl";
import type {LineStyle} from "./strokeStyle";

export function LineStylePicker({value,onChange}:{value?:LineStyle;onChange:(value:LineStyle)=>void}){
  return <SegmentedControl label="線の種類" value={value??""} onChange={v=>onChange(v as LineStyle)} layout="fill" size="sm">
    {([{id:"solid",label:"実線"},{id:"dotted",label:"点線"},{id:"dashed",label:"破線"},{id:"wavy",label:"波線"}] as const).map(({id,label})=>
      <SegmentedControlItem key={id} value={id} label={label} icon={
        <svg width="20" height="12" viewBox="0 0 44 12" aria-hidden="true">
          <path d={id==="wavy"?"M3 6Q8 0 13 6T23 6T33 6T41 6":"M3 6H41"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={id==="dotted"?"0.1 6":id==="dashed"?"9 6":undefined}/>
        </svg>
      }/>
    )}
  </SegmentedControl>;
}
