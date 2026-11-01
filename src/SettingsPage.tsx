import { useRef, useEffect, useState, type ReactNode } from "react";
import { Palette, Cloud, Archive, Info, CircleHelp } from "lucide-react";
import packageInfo from "../package.json";
import type { Preferences } from "./preferences";
import { isDarkColor } from "./paper";
import { imageStroke } from "./images";
export function SettingsPage({value,onChange,onClose,drive,backup,restore,help,pwa,onError,error,onApply,ready}:{value:Preferences;onChange:(p:Preferences)=>void;onClose:()=>void;drive:ReactNode;backup:()=>void;restore:()=>void;help:ReactNode;pwa:ReactNode;onError:(s:string)=>void;error:string;onApply?:()=>void;ready:boolean}){
 useEffect(()=>{const title=document.title;document.title="設定 | MPP Notes";return()=>{document.title=title;};},[]);
 const latest=useRef(value);latest.current=value;
 const update=(patch:Partial<Preferences>)=>onChange({...latest.current,...patch});
 const tabs=[{id:"theme",label:"テーマ",Icon:Palette},{id:"drive",label:"Google Drive連携",Icon:Cloud},{id:"backup",label:"バックアップと復元",Icon:Archive},{id:"about",label:"このアプリについて",Icon:Info},{id:"help",label:"ヘルプ",Icon:CircleHelp}];
 const readTab=()=>{const id=new URLSearchParams(location.search).get("tab");return tabs.some(t=>t.id===id)?id!:"theme";};
 const [tab,setTab]=useState(readTab);
 useEffect(()=>{const change=()=>setTab(readTab());window.addEventListener("popstate",change);return()=>window.removeEventListener("popstate",change);},[]);
 function selectTab(id:string){setTab(id);const url=new URL(location.href);url.searchParams.set("tab",id);window.history.pushState(null,"",url);}
 const color=value.paperColor==="auto"?(value.theme==="dark"||(value.theme==="system"&&matchMedia("(prefers-color-scheme: dark)").matches)?"#1e2822":"#fffefa"):value.paperColor;
 return <section className="settings-page settings-route" aria-label="設定">
 <div className="settings-inner"><header><button onClick={onClose}>← 戻る</button><h1>設定</h1></header>
 <div className="settings-layout"><nav className="settings-nav" role="tablist" aria-label="設定項目">{tabs.map(({id,label,Icon})=><button key={id} role="tab" id={"tab-"+id} aria-selected={tab===id} aria-controls="settings-panel" onClick={()=>selectTab(id)}><Icon size={19}/><span>{label}</span></button>)}</nav><div className="settings-content" role="tabpanel" id="settings-panel" aria-labelledby={"tab-"+tab}>
 {error&&<p role="alert">{error}</p>}{tab==="theme"&&<><h2>表示テーマ</h2><div className="settings-choices">{(["system","light","dark"] as const).map((theme,i)=><button aria-pressed={value.theme===theme} key={theme} onClick={()=>update({theme})}><span className={"theme-preview "+theme}><i/><b/><em/></span>{["システム","ライト","ダーク"][i]}</button>)}</div>
 <h2>テーマの色味</h2><div className="settings-choices">{(["green","blue","rose"] as const).map((accent,i)=><button aria-pressed={value.accent===accent} key={accent} onClick={()=>update({accent})}><span className="accent-preview" style={{background:["#345d48","#365b88","#92546d"][i]}}/>{["フォレスト","ブルー","ローズ"][i]}</button>)}</div>
 <h2>新しいノートの用紙</h2><p>新規ノートに使います。ページ追加時は直前のページを引き継ぎます。</p>
 <div className="paper-settings"><div className={"paper-preview "+value.paperPattern} style={{backgroundColor:color}}>{value.paperImage&&<img src={value.paperImage} alt="背景画像の見本"/>}<span style={{color:isDarkColor(color)?"#e1ebd8":"#345d48"}}>Aa<br/>手書きノート</span></div><div>
 <label>既定の用紙色<select aria-label="既定の用紙色" value={value.paperColor} onChange={e=>update({paperColor:e.target.value})}><option value="auto">テーマに合わせる</option>{[["#fffefa","白"],["#fff7dc","クリーム"],["#e9edf2","グレー"],["#1e2822","ダーク"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}{!["auto","#fffefa","#fff7dc","#e9edf2","#1e2822"].includes(value.paperColor)&&<option value={value.paperColor}>カスタム</option>}</select></label>
 <input aria-label="既定のカスタム用紙色" type="color" value={color} onChange={e=>update({paperColor:e.target.value})}/>
 <div className="settings-choices">{(["blank","ruled","grid"] as const).map((paperPattern,i)=><button aria-pressed={value.paperPattern===paperPattern} key={paperPattern} onClick={()=>update({paperPattern})}><span className={"pattern-preview "+paperPattern}/>{["白紙","罫線","方眼"][i]}</button>)}</div>
 <label className="settings-upload">背景画像を選択<input aria-label="既定の背景画像" type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)void imageStroke(f,{width:794,height:1123}).then(s=>update({paperImage:s.image})).catch(e=>onError(e.message));}}/></label>{value.paperImage&&<button onClick={()=>update({paperImage:undefined})}>背景画像を解除</button>}
 </div></div>
 {onApply&&<button className="primary" onClick={onApply}>開いているノートの全ページに適用</button>}
 </>}{tab==="drive"&&<>{drive}</>}
 {tab==="backup"&&<><h2>バックアップと復元</h2>
<p>大切なノートはZIPでも保存してください。復元したノートは追加されます。</p><div className="settings-actions"><button disabled={!ready} onClick={backup}>バックアップを書き出す</button><button disabled={!ready} onClick={restore}>バックアップを復元する</button></div>
 </>}{tab==="about"&&<><h2>このアプリについて</h2><img src="./icon.svg" width="64" height="64" alt=""/><h3>MPP Notes</h3><p>バージョン {packageInfo.version}</p><p>手書きとPDFのためのノートアプリ</p><div className="settings-actions"><a href="./privacy.html" target="_blank" rel="noreferrer">プライバシーポリシー</a><a href="./terms.html" target="_blank" rel="noreferrer">利用規約</a><a href="https://github.com/smdast/mpp-notes" target="_blank" rel="noreferrer">ソースコード</a></div>{pwa}</>}
 {tab==="help"&&<><h2>ヘルプ</h2>{help}</>}
 </div></div></div></section>;
}
