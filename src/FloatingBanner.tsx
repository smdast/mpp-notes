import {useTheme} from "@astryxdesign/core/theme";
import {useEffect,useRef,type ComponentProps} from "react";
import {Banner} from "@astryxdesign/core/Banner";
import {useToast} from "@astryxdesign/core/Toast";
// Astryx owns stacking, focus, reduced motion and the top layer above dialogs.
// The card content remains a Banner, with persistent errors and explicit close.
export function FloatingBanner(props:ComponentProps<typeof Banner>){
 const {mode}=useTheme();
 const showToast=useToast(),latest=useRef(props);latest.current=props;
 useEffect(()=>{
  let mounted=true;
  const dismiss=showToast({
   body:props.title,type:props.status==="error"?"error":"info",isAutoHide:false,
   onHide:reason=>{if(mounted&&reason==="manual")latest.current.onDismiss?.();},
   renderContent:({dismiss})=><Banner container="card" elevation="none" isDismissable dismissLabel="メッセージを閉じる" {...latest.current} role={undefined} data-notes-floating-banner style={{...latest.current.style,colorScheme:mode}} onDismiss={dismiss}/>,
  });
  return ()=>{mounted=false;dismiss();};
 },[showToast,props.title,props.status,mode]);
 return null;
}
