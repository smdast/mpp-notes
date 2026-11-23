import {ErrorBanner} from "./ErrorBanner";
import {CustomColor,ColorDialog} from "./CustomColor";
import {FilePicker} from "./FilePicker";
import {Selector} from "@astryxdesign/core/Selector";
import {ActionButton} from "./ActionButton";
import {Button} from "@astryxdesign/core/Button";
import { useRef, useEffect, useState, type ReactNode, type CSSProperties } from "react";
import { Palette, Cloud, Archive, Info, CircleHelp, ArrowLeft,SlidersHorizontal } from "lucide-react";
import {OperationSettings} from "./OperationSettings";
import packageInfo from "../package.json";
import type { Preferences } from "./preferences";
import { isDarkColor } from "./paper";
import { imageStroke } from "./images";
import {ReleaseHistory} from "./ReleaseHistory";
export function SettingsPage({value,onChange,onClose,sync,backup,restore,help,pwa,onError,error,onApply,ready}:{value:Preferences;onChange:(p:Preferences)=>void;onClose:()=>void;sync:ReactNode;backup:()=>void;restore:()=>void;help:ReactNode;pwa:ReactNode;onError:(s:string)=>void;error:string;onApply?:()=>void;ready:boolean}){
 useEffect(()=>{const title=document.title;document.title="設定 | MPP Notes";return()=>{document.title=title;};},[]);
 const latest=useRef(value);latest.current=value;
 const update=(patch:Partial<Preferences>)=>onChange({...latest.current,...patch});
 const tabs=[{id:"theme",label:"テーマ",Icon:Palette},{id:"controls",label:"操作設定",Icon:SlidersHorizontal},{id:"sync",label:"同期",Icon:Cloud},{id:"backup",label:"バックアップと復元",Icon:Archive},{id:"about",label:"このアプリについて",Icon:Info},{id:"help",label:"ヘルプ",Icon:CircleHelp}];
 const readTab=()=>{const raw=new URLSearchParams(location.search).get("tab"),id=raw==="drive"?"sync":raw;return tabs.some(t=>t.id===id)?id!:"theme";};
 const [tab,setTab]=useState(readTab);
 const [customColorOpen,setCustomColorOpen]=useState(false);
 useEffect(()=>{const change=()=>setTab(readTab());window.addEventListener("popstate",change);return()=>window.removeEventListener("popstate",change);},[]);
 function selectTab(id:string){setTab(id);const url=new URL(location.href);url.searchParams.set("tab",id);window.history.pushState(null,"",url);}
 const color=value.paperColor==="auto"?(value.theme==="dark"||(value.theme==="system"&&matchMedia("(prefers-color-scheme: dark)").matches)?"#1e2822":"#fffefa"):value.paperColor;
 const paperStyle={backgroundColor:color,"--paper-guide":`color-mix(in srgb,var(${isDarkColor(color)?"--color-on-dark":"--color-on-light"}) 20%,transparent)`} as CSSProperties;
 return <section className="settings-page settings-route" aria-label="設定">
 <div className="settings-inner"><header><Button label="戻る" variant="ghost" icon={<ArrowLeft size={18}/>} onClick={onClose}/><h1 className="settings-title"><img src="./icon.svg" width="28" height="28" alt=""/>設定</h1></header>
 <div className="settings-layout"><nav className="settings-nav" role="tablist" aria-label="設定項目">{tabs.map(({id,label,Icon})=><ActionButton key={id} role="tab" id={"tab-"+id} aria-selected={tab===id} aria-controls="settings-panel" onClick={()=>selectTab(id)}><Icon size={19}/><span>{label}</span></ActionButton>)}</nav><div key={tab} className="settings-content" role="tabpanel" id="settings-panel" aria-labelledby={"tab-"+tab}>
 {error&&<ErrorBanner message={error} onDismiss={()=>onError("")}/> }{tab==="theme"&&<><h2>表示テーマ</h2><div className="settings-choices">{(["system","light","dark"] as const).map((theme,i)=><ActionButton aria-pressed={value.theme===theme} key={theme} onClick={()=>update({theme})}><span className={"theme-preview "+theme}><i/><b/><em/></span>{["システム","ライト","ダーク"][i]}</ActionButton>)}</div>
 <h2>テーマの色味</h2><div className="settings-choices">{(["green","blue","rose"] as const).map((accent,i)=><ActionButton aria-pressed={value.accent===accent} key={accent} onClick={()=>update({accent})}><span className="accent-preview" style={{background:["#345d48","#365b88","#92546d"][i]}}/>{["フォレスト","ブルー","ローズ"][i]}</ActionButton>)}</div>
 <h2>新しいノートの用紙</h2><p>新規ノートに使います。ページ追加時は直前のページを引き継ぎます。</p>
 <div className="paper-settings"><div className={"paper-preview "+value.paperPattern} style={paperStyle}>{value.paperImage&&<img src={value.paperImage} alt="背景画像の見本"/>}<span style={{color:isDarkColor(color)?"#e1ebd8":"#345d48"}}>Aa<br/>手書きノート</span></div><div>
 <Selector label="既定の用紙色" value={["auto","#fffefa","#fff7dc","#e9edf2","#1e2822"].includes(value.paperColor)?value.paperColor:"custom"} onChange={paperColor=>{if(paperColor==="custom")setCustomColorOpen(true);else if(paperColor)update({paperColor});}} options={[{value:"auto",label:"テーマに合わせる"},{value:"#fffefa",label:"白"},{value:"#fff7dc",label:"クリーム"},{value:"#e9edf2",label:"グレー"},{value:"#1e2822",label:"ダーク"},{value:"custom",label:"カスタム"}]}/>
 {!["auto","#fffefa","#fff7dc","#e9edf2","#1e2822"].includes(value.paperColor)&&<CustomColor label="カスタム色を変更" value={color} onChange={paperColor=>update({paperColor})}/>}
 {customColorOpen&&<ColorDialog value={color} onChange={paperColor=>update({paperColor})} onClose={()=>setCustomColorOpen(false)}/>}
 <div className="settings-choices">{(["blank","ruled","grid"] as const).map((paperPattern,i)=><ActionButton aria-pressed={value.paperPattern===paperPattern} key={paperPattern} onClick={()=>update({paperPattern})}><span className={"pattern-preview "+paperPattern} style={paperStyle}/>{["白紙","罫線","方眼"][i]}</ActionButton>)}</div>
 <FilePicker label="背景画像を選択" accept="image/*" onSelect={f=>{void imageStroke(f,{width:794,height:1123}).then(s=>update({paperImage:s.image})).catch(e=>onError(e.message));}}/>{value.paperImage&&<ActionButton onClick={()=>update({paperImage:undefined})}>背景画像を解除</ActionButton>}
 </div></div>
 {onApply&&<Button label="開いているノートの全ページに適用" variant="primary" onClick={onApply}/>}
 </>}{tab==="controls"&&<OperationSettings value={value} onChange={onChange}/>} {tab==="sync"&&<>{sync}</>}
 {tab==="backup"&&<><h2>バックアップと復元</h2>
<p>大切なノートはZIPでも保存してください。復元したノートは追加されます。</p><div className="settings-actions"><Button label="バックアップを書き出す" isDisabled={!ready} onClick={backup}/><Button label="バックアップを復元する" isDisabled={!ready} onClick={restore}/></div>
 </>}{tab==="about"&&<><h2>このアプリについて</h2><img src="./icon.svg" width="64" height="64" alt=""/><h3>MPP Notes</h3><p>バージョン {packageInfo.version}</p><p>手書きとPDFのためのノートアプリ</p><div className="settings-actions"><a href="./privacy.html" target="_blank" rel="noreferrer">プライバシーポリシー</a><a href="./terms.html" target="_blank" rel="noreferrer">利用規約</a><a href="https://github.com/smdast/mpp-notes" target="_blank" rel="noreferrer">ソースコード</a></div>{pwa}<details className="release-details"><summary>更新履歴を見る</summary><ReleaseHistory/></details></>}
 {tab==="help"&&<><h2>ヘルプ</h2>{help}</>}
 </div></div></div></section>;
}
