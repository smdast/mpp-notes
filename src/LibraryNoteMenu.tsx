import {useLayoutEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {MoreVertical,PenLine,Trash2,ImagePlus,RotateCcw,FolderInput} from "lucide-react";
import {useDismiss} from "./useDismiss";
import {displayPath} from "./Breadcrumb";
import type {Note} from "./model";

export function LibraryNoteMenu({note,folders,onRename,onDelete,onCover,onMove}:{
  note:Note;folders:string[];onRename:()=>void;onDelete:()=>void;
  onCover:(file?:File)=>void;onMove:(folder:string)=>void;
}){
  const [open,setOpen]=useState(false),[position,setPosition]=useState({left:0,top:0});
  const anchor=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
  useDismiss(open,[anchor,panel],()=>setOpen(false));
  useLayoutEffect(()=>{
    if(!open)return;
    const update=()=>{
      const button=anchor.current?.getBoundingClientRect(),menu=panel.current?.getBoundingClientRect();
      if(!button||!menu)return;
      setPosition({left:Math.max(8,Math.min(innerWidth-menu.width-8,button.right-menu.width)),
        top:Math.max(8,Math.min(innerHeight-menu.height-8,button.bottom+6))});
    };
    update();
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus({preventScroll:true});
    window.addEventListener("scroll",update,true);window.addEventListener("resize",update);
    return()=>{window.removeEventListener("scroll",update,true);window.removeEventListener("resize",update);};
  },[open]);
  const run=(action:()=>void)=>{setOpen(false);action();};
  return <div className="library-note-menu">
    <button ref={anchor} className="note-more" aria-label={note.title+" の操作"} title="ノートの操作"
      aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(!open)}><MoreVertical size={19}/></button>
    <input ref={input} hidden type="file" accept="image/*" aria-label={note.title+" の表紙画像"} onChange={event=>{
      const file=event.currentTarget.files?.[0];event.currentTarget.value="";
      if(file)onCover(file);
    }}/>
    {open&&createPortal(<div ref={panel} role="dialog" aria-label={note.title+" の操作"}
      className="library-note-panel" style={position} onKeyDown={event=>{
        if(event.key==="Escape"){event.stopPropagation();setOpen(false);anchor.current?.focus();}
      }}>
      <button onClick={()=>run(onRename)}><PenLine size={16}/>名前変更</button>
      <button onClick={()=>{input.current?.click();setOpen(false);}}><ImagePlus size={16}/>表紙画像を選択</button>
      {note.coverImage&&<button onClick={()=>run(()=>onCover())}><RotateCcw size={16}/>1ページ目を表紙にする</button>}
      <label><span><FolderInput size={16}/>フォルダーへ移動</span>
        <select aria-label={note.title+" の移動先"} value={note.folder??""} onChange={event=>{const target=event.currentTarget.value;run(()=>onMove(target));}}>
          <option value="">未分類</option>
          {folders.map(folder=><option key={folder} value={folder}>{displayPath(folder)}</option>)}
        </select>
      </label>
      <button className="danger" onClick={()=>run(onDelete)}><Trash2 size={16}/>削除</button>
    </div>,document.body)}
  </div>;
}
