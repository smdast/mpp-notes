import {Popover} from "@astryxdesign/core/Popover";
import {FilePickerDialog} from "./FilePicker";
import {useRef,useState} from "react";
import {MoreVertical,PenLine,Trash2,ImagePlus,RotateCcw,FolderInput} from "lucide-react";
import {useDismiss} from "./useDismiss";
import {displayPath} from "./Breadcrumb";
import type {Note} from "./model";

export function LibraryNoteMenu({note,folders,onRename,onDelete,onCover,onMove}:{
  note:Note;folders:string[];onRename:()=>void;onDelete:()=>void;
  onCover:(file?:File)=>void;onMove:(folder:string)=>void;
}){
  const [coverOpen,setCoverOpen]=useState(false);
  const [open,setOpen]=useState(false);
  const anchor=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
  useDismiss(open,[anchor,panel],()=>setOpen(false));
  const run=(action:()=>void)=>{setOpen(false);action();};
  return <div className="library-note-menu">
    <button ref={anchor} className="note-more" aria-label={note.title+" の操作"} title="ノートの操作"
      aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(!open)}><MoreVertical size={19}/></button>
    {coverOpen&&<FilePickerDialog label="表紙画像を選択" accept="image/*" onSelect={onCover} onClose={()=>setCoverOpen(false)}/>}
    {open&&<Popover anchorRef={anchor as React.RefObject<HTMLElement>} isEnabled={false} isOpen={open} onOpenChange={setOpen} label={note.title+" の操作"} alignment="end" width={240} padding={2} hasLightDismiss={false} hasEscapeDismiss={false} content={<div ref={panel}
      className="library-note-panel" onKeyDown={event=>{
        if(event.key==="Escape"){event.stopPropagation();setOpen(false);anchor.current?.focus();}
      }}>
      <button onClick={()=>run(onRename)}><PenLine size={16}/>名前変更</button>
      <button onClick={()=>{setCoverOpen(true);setOpen(false);}}><ImagePlus size={16}/>表紙画像を選択</button>
      {note.coverImage&&<button onClick={()=>run(()=>onCover())}><RotateCcw size={16}/>1ページ目を表紙にする</button>}
      <label><span><FolderInput size={16}/>フォルダーへ移動</span>
        <select aria-label={note.title+" の移動先"} value={note.folder??""} onChange={event=>{const target=event.currentTarget.value;run(()=>onMove(target));}}>
          <option value="">未分類</option>
          {folders.map(folder=><option key={folder} value={folder}>{displayPath(folder)}</option>)}
        </select>
      </label>
      <button className="danger" onClick={()=>run(onDelete)}><Trash2 size={16}/>削除</button>
    </div>}/>}
  </div>;
}
