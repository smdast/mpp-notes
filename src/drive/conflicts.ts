import type {Note} from "../model";
export type ConflictVariant={id:string;device:string;local:boolean;updated:number;note?:Note};
export type NoteConflict={key:string;entity:string;variants:ConflictVariant[];suggested:string};
export type ConflictChoice={mode:"keep";revisionId:string}|{mode:"both"};
export function newestVariant(variants:ConflictVariant[]){
  return [...variants].sort((a,b)=>b.updated-a.updated||a.id.localeCompare(b.id))[0]?.id||"";
}
export class SyncConflictRequired extends Error {
  constructor(readonly conflict:NoteConflict){super("同期の競合を確認してください。");this.name="SyncConflictRequired";}
}
