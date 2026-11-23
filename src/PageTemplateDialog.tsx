import {ErrorBanner} from "./ErrorBanner";
import {useEffect,useRef,useState} from "react";
import {Selector} from "@astryxdesign/core/Selector";
import {Button} from "@astryxdesign/core/Button";
import {HStack} from "@astryxdesign/core/HStack";
import {AppDialog} from "./AppDialog";
import {CustomColor,ColorDialog} from "./CustomColor";
import {FilePicker} from "./FilePicker";
import type {Page} from "./model";
import {pagePaperColor} from "./paper";
import {imageStroke} from "./images";
type Props={page:Page;number:number;dark:boolean;onChange:(patch:Partial<Page>)=>void;onApply:()=>void;onClose:()=>void};
const colors=[{value:"#fffefa",label:"白"},{value:"#fff7dc",label:"クリーム"},{value:"#e9edf2",label:"グレー"},{value:"#1e2822",label:"ダークグリーン"},{value:"#20252d",label:"ダークグレー"}];
export function PageTemplateDialog({page,number,dark,onChange,onApply,onClose}:Props){
 const alive=useRef(true),request=useRef(0);
 const [error,setError]=useState(""),[loading,setLoading]=useState(false),[colorOpen,setColorOpen]=useState(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const color=pagePaperColor(page,dark),custom=!colors.some(c=>c.value===color);
 return <AppDialog title={`ページ ${number} のテンプレート`} onClose={onClose}>
 <p>変更はこのページに自動保存されます。</p>
 <Selector label="用紙" value={page.paper} options={[{value:"blank",label:"白紙"},{value:"ruled",label:"罫線"},{value:"grid",label:"方眼"}]} onChange={paper=>{if(paper)onChange({paper:paper as Page["paper"]});}}/>
 <Selector label="用紙色" value={custom?"custom":color} options={[...colors,{value:"custom",label:"カスタム"}]} onChange={paperColor=>{if(paperColor==="custom")setColorOpen(true);else if(paperColor)onChange({paperColor});}}/>
 {custom&&<CustomColor label="カスタム色を変更" value={color} onChange={paperColor=>onChange({paperColor})}/>}
 {colorOpen&&<ColorDialog value={color} onChange={paperColor=>onChange({paperColor})} onClose={()=>setColorOpen(false)}/>}
 <FilePicker label="背景画像" accept="image/*" disabled={loading} onSelect={file=>{
  const epoch=++request.current;setError("");setLoading(true);
  void imageStroke(file,page).then(s=>{if(alive.current&&request.current===epoch)onChange({backgroundImage:s.image});}).catch(e=>{if(alive.current)setError(e.message);}).finally(()=>{if(alive.current)setLoading(false);});
 }}/>
 {page.backgroundImage&&<Button label="背景画像を解除" isDisabled={loading} onClick={()=>onChange({backgroundImage:undefined})}/>}
 {loading&&<p role="status">画像を読み込み中…</p>}{error&&<ErrorBanner message={error} onDismiss={()=>setError("")}/> }
 <p>「全ページに適用」で、同じノートの用紙を揃えます。PDFの背景は保持します。</p>
 <HStack gap={2} hAlign="end"><Button label="全ページに適用" isDisabled={loading} onClick={onApply}/><Button label="閉じる" variant="primary" onClick={onClose}/></HStack>
 </AppDialog>;
}
