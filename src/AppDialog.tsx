import {Dialog,DialogHeader} from "@astryxdesign/core/Dialog";
import {VStack} from "@astryxdesign/core/VStack";
import type {ReactNode} from "react";
export function AppDialog({title,onClose,children,width=440,required=false}:{title:string;onClose:()=>void;children:ReactNode;width?:number;required?:boolean}){
 return <Dialog isOpen onOpenChange={open=>{if(!open)onClose();}} purpose={required?"required":"info"} width={width} maxHeight="90dvh" padding={6} className="notes-dialog" aria-label={title}>
  <VStack gap={5}><DialogHeader title={title} onOpenChange={required?undefined:open=>{if(!open)onClose();}}/>{children}</VStack>
 </Dialog>;
}
