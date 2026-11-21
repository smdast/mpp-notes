import {Children,isValidElement,type ButtonHTMLAttributes,type ReactNode, type Ref} from "react";
import {Button} from "@astryxdesign/core/Button";
function textOf(content:ReactNode):string {
 return Children.toArray(content).map(child=>typeof child==="string"||typeof child==="number"?String(child):isValidElement<{children?:ReactNode}>(child)?textOf(child.props.children):"").join(" ").trim();
}
/** Retains native canvas event handlers and refs while adopting Astryx actions. */
export function ActionButton({children,disabled,className="",ref,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{ref?:Ref<HTMLButtonElement>}){
 const label=props["aria-label"]||props.title||textOf(children)||"操作";
 const variant=/primary|new-note/.test(className)?"primary":/danger/.test(className)?"destructive":"ghost";
 return <Button {...props} ref={ref} label={label} variant={variant} isDisabled={disabled} className={"notes-action "+className}>{children}</Button>;
}
