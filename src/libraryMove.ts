import {folderName,isWithin,parentFolder,relocateFolder} from "./folders";
import type {Note} from "./model";

export type LibraryItem={kind:"note"|"folder";id:string};

export function libraryMoveTarget(item:LibraryItem,target:string,notes:Note[],folders:string[]){
  const parent=target==="*"?"":target;
  if(parent&&!folders.includes(parent))throw new Error("移動先のフォルダーが見つかりません。");
  if(item.kind==="note"){
    const note=notes.find(note=>note.id===item.id);
    if(!note)throw new Error("ノートが見つかりません。");
    return (note.folder??"")===parent?undefined:parent;
  }
  if(!folders.includes(item.id))throw new Error("フォルダーが見つかりません。");
  if(parent===item.id||isWithin(parent,item.id))throw new Error("自分自身や配下のフォルダーには移動できません。");
  if(parentFolder(item.id)===parent)return;
  const destination=parent?parent+"/"+folderName(item.id):folderName(item.id);
  if(folders.includes(destination))throw new Error("移動先に同じ名前のフォルダーがあります。");
  if(folders.some(path=>isWithin(path,item.id)&&(destination+path.slice(item.id.length)).split("/").length>20))
    throw new Error("フォルダーは20階層まで作成できます。");
  return destination;
}
export function moveLibraryItem(item:LibraryItem,target:string,notes:Note[],folders:string[]){
  const destination=libraryMoveTarget(item,target,notes,folders);
  if(destination===undefined)return {notes,folders};
  if(item.kind==="folder")return relocateFolder(folders,notes,item.id,destination);
  return {folders,notes:notes.map(note=>note.id===item.id?{...note,folder:destination||undefined,updated:Date.now()}:note)};
}
