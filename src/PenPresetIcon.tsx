import {useId} from "react";
import type {AutoPenColor,PenKind} from "./preferences";
export function PenPresetIcon({kind,color,autoColor}:{kind:PenKind;color:string;autoColor?:AutoPenColor}){
 const id="pen-ink-"+useId().replaceAll(":","");
 const automatic=autoColor?.enabled;
 const body=automatic?`url(#${id})`:color;
 const outline="var(--color-icon-primary)";
 return <svg className="pen-preset-icon" width="30" height="36" viewBox="0 0 36 42" aria-hidden="true" focusable="false">
  {automatic&&<defs><linearGradient id={id}><stop offset="50%" stopColor={autoColor.onLight}/><stop offset="50%" stopColor={autoColor.onDark}/></linearGradient></defs>}
  {kind==="pen"?<>
   <path d="M9 6Q9 3 12 3H18Q21 3 21 6V27H9Z" fill={body} stroke={outline} strokeWidth="1.5"/>
   <path d="M9 27H21L16 38H14Z" fill={color} stroke={outline} strokeWidth="1.5" strokeLinejoin="round"/>
   <path d="M12 7V23" stroke="var(--color-background-surface)" strokeWidth="1.5" opacity=".6"/>
   <path d="M14 38H16" stroke={outline} strokeWidth="2" strokeLinecap="round"/>
  </>:<>
   <path d="M6 7Q6 3 10 3H20Q24 3 24 7V25L21 29H9L6 25Z" fill={body} stroke={outline} strokeWidth="1.5"/>
   <path d="M10 29H20V35L10 39Z" fill={color} stroke={outline} strokeWidth="1.5" strokeLinejoin="round"/>
   <path d="M10 8V23M6 25H24" stroke="var(--color-background-surface)" strokeWidth="1.5" opacity=".6"/>
  </>}
  {automatic&&<g fill="var(--color-background-surface)" stroke="var(--color-icon-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
   <circle cx="28" cy="9" r="7"/>
   <path d="M24 7H32L30 5M32 11H24L26 13" fill="none"/>
  </g>}
 </svg>;
}
