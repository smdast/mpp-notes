import {useEffect,useRef,useState} from "react";
import {Eraser,Lasso,Keyboard,RotateCcw,X,Plus,PenLine} from "lucide-react";
import type {Preferences} from "./preferences";
import {defaultShortcuts,formatShortcut,reservedShortcut,shortcutActions,shortcutFromEvent,type ShortcutAction} from "./shortcuts";
export function OperationSettings({value,onChange}:{value:Preferences;onChange:(value:Preferences)=>void}){
  const [recording,setRecording]=useState<{action:ShortcutAction;index:number}|null>(null),[message,setMessage]=useState("");
  const latest=useRef(value);latest.current=value;const row=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{
    if(!recording)return;
    const key=(event:KeyboardEvent)=>{
      if(event.key==="Tab"){setRecording(null);return;}
      event.preventDefault();event.stopImmediatePropagation();
      const binding=shortcutFromEvent(event);if(!binding){if(!["Control","Shift","Alt","Meta","AltGraph"].includes(event.key))setMessage("このキーは登録できません。別のキーを押してください。");return;}
      if(reservedShortcut(binding)){setMessage("ブラウザーやOSが使用する組み合わせです。別のキーを押してください。");return;}
      const conflict=shortcutActions.find(([action])=>action!==recording.action&&latest.current.shortcuts[action].includes(binding));
      if(conflict){setMessage(`「${conflict[1]}」に登録されています。先にその割り当てを解除してください。`);return;}
      const bindings=[...latest.current.shortcuts[recording.action]];
      if(bindings.includes(binding)&&bindings[recording.index]!==binding){setMessage("同じ操作に登録済みです。");return;}
      bindings[recording.index]=binding;
      onChange({...latest.current,shortcuts:{...latest.current.shortcuts,[recording.action]:bindings}});
      setMessage("ショートカットを保存しました。");setRecording(null);
    };
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!row.current?.contains(event.target))setRecording(null);};
    window.addEventListener("keydown",key,true);window.addEventListener("pointerdown",outside,true);
    return()=>{window.removeEventListener("keydown",key,true);window.removeEventListener("pointerdown",outside,true);};
  },[recording,onChange]);
  return <div className="operation-settings"><h2><PenLine size={20}/>ペンのボタン</h2><p>選択ボタンを押しながら用紙に触れたときの操作を選びます。</p>
    <div className="pen-button-options">{([{id:"lasso",label:"なげなわ選択",Icon:Lasso},{id:"eraser",label:"消しゴム",Icon:Eraser}] as const).map(({id,label,Icon})=><button key={id} aria-pressed={value.selectionButton===id} onClick={()=>onChange({...latest.current,selectionButton:id})}><Icon size={22}/><b>{label}</b></button>)}</div>
    <p className="operation-note">専用の消しゴムボタン・ペンの消しゴム側は、常に消去として動作します。ボタンはペン入力としてブラウザーに通知される場合に使えます。</p>
    <h2><Keyboard size={20}/>キーボードショートカット</h2><p>キー表示を押して、登録するキーの組み合わせを入力してください。各操作に2つまで登録できます。Ctrlと⌘は共通の割り当てです。</p>
    <p role="status" className="shortcut-message">{message}</p><div className="shortcut-list">{shortcutActions.map(([action,label])=><div className="shortcut-row" key={action} ref={recording?.action===action?row:undefined}><label>{label}</label><div className="shortcut-bindings">{value.shortcuts[action].map((binding,index)=><span className="shortcut-binding" key={index}><button className={recording?.action===action&&recording.index===index?"recording":""} aria-label={`${label}のショートカット ${index+1}：${formatShortcut(binding)}`} onClick={()=>{setRecording({action,index});setMessage("登録したいキーを押してください。外側を押すと中止します。");}}>{recording?.action===action&&recording.index===index?"キーを入力…":formatShortcut(binding)}</button><button aria-label={`${label}のショートカット ${index+1}を解除`} onClick={()=>{setRecording(null);onChange({...latest.current,shortcuts:{...latest.current.shortcuts,[action]:latest.current.shortcuts[action].filter((_,i)=>i!==index)}});}}><X size={13}/></button></span>)}{value.shortcuts[action].length<2&&<button className="shortcut-add" aria-label={`${label}のショートカットを追加`} onClick={()=>{setRecording({action,index:value.shortcuts[action].length});setMessage("登録したいキーを押してください。外側を押すと中止します。");}}><Plus size={13}/>{recording?.action===action&&recording.index===value.shortcuts[action].length?"キーを入力…":value.shortcuts[action].length?"追加":"未設定"}</button>}</div></div>)}</div>
    <p className="operation-note">文字入力中やダイアログ表示中は編集操作を実行しません。ページの移動はページ一覧にフォーカスがあるときに使います。ダイアログのEsc・Tabやブラウザー・OSの操作は変更対象外です。</p>
    <button className="shortcut-reset" onClick={()=>{setRecording(null);onChange({...latest.current,shortcuts:defaultShortcuts()});setMessage("標準のショートカットに戻しました。");}}><RotateCcw size={15}/>ショートカットを標準に戻す</button>
  </div>;
}
