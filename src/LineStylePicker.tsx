import type {LineStyle} from "./strokeStyle";

export function LineStylePicker({value,onChange}:{value?:LineStyle;onChange:(value:LineStyle)=>void}){
  return <div className="line-styles" role="group" aria-label="線の種類">
    {([{id:"solid",label:"実線"},{id:"dotted",label:"点線"},{id:"dashed",label:"破線"}] as const).map(({id,label})=>
      <button key={id} type="button" title={label} aria-pressed={value===id} onClick={()=>onChange(id)}>
        <svg width="44" height="12" viewBox="0 0 44 12" aria-hidden="true">
          <path d="M3 6H41" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={id==="dotted"?"0.1 6":id==="dashed"?"9 6":undefined}/>
        </svg>
        <span>{label}</span>
      </button>)}
  </div>;
}
