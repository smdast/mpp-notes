import {FloatingBanner} from "./FloatingBanner";
import {Button} from "@astryxdesign/core/Button";
export function ErrorBanner({message,onDismiss,onRetry}:{message:string;onDismiss?:()=>void;onRetry?:()=>void}){
 return <FloatingBanner key={message} status="error" role="alert" title={message} onDismiss={onDismiss} dismissLabel="メッセージを閉じる" endContent={onRetry?<Button label="再保存" onClick={onRetry}/>:undefined}/>;
}
