export const shortcutActions=[
  ["pen","ペン"],["marker","蛍光ペン"],["eraser","消しゴム"],["lasso","なげなわ選択"],["hand","移動ツール"],
  ["undo","元に戻す"],["redo","やり直し"],["copy","コピー"],["cut","切り取り"],["paste","貼り付け"],
  ["duplicate","選択内容を複製"],["rotate","選択内容を90度回転"],["deleteSelection","選択内容を削除"],["clearSelection","選択を解除・移動を中止"],
  ["pageLeft","ページを左へ移動"],["pageRight","ページを右へ移動"],["pageUp","ページを上へ移動"],["pageDown","ページを下へ移動"],
] as const;
export type ShortcutAction=typeof shortcutActions[number][0];
export type ShortcutMap=Record<ShortcutAction,string[]>;
export function defaultShortcuts():ShortcutMap{return {
  pen:["KeyP"],marker:["KeyH"],eraser:["KeyE"],lasso:["KeyL"],hand:["KeyV"],
  undo:["Mod+KeyZ"],redo:["Mod+Shift+KeyZ","Mod+KeyY"],copy:["Mod+KeyC"],cut:["Mod+KeyX"],paste:["Mod+KeyV"],
  duplicate:[],rotate:[],deleteSelection:["Delete","Backspace"],clearSelection:["Escape"],
  pageLeft:["Alt+ArrowLeft"],pageRight:["Alt+ArrowRight"],pageUp:["Alt+ArrowUp"],pageDown:["Alt+ArrowDown"],
};}
const codePattern=/^(Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Numpad(?:[0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter)|Arrow(?:Left|Right|Up|Down)|Delete|Backspace|Escape|Space|Enter|Insert|Home|End|PageUp|PageDown|Minus|Equal|BracketLeft|BracketRight|Backslash|IntlBackslash|Semicolon|Quote|Comma|Period|Slash|Backquote)$/;
export function validShortcut(value:unknown):value is string{
  if(typeof value!=="string")return false;const parts=value.split("+"),code=parts.pop()!;
  return codePattern.test(code)&&parts.every(p=>["Mod","Alt","Shift"].includes(p))&&new Set(parts).size===parts.length&&[...parts].sort((a,b)=>["Mod","Alt","Shift"].indexOf(a)-["Mod","Alt","Shift"].indexOf(b)).join("+")===parts.join("+");
}
export function reservedShortcut(value:string){return /^(?:Mod\+(?:Shift\+)?(?:KeyW|KeyT|KeyN|KeyL|KeyR)|Alt\+F4|F5|F11|F12)$/.test(value);}
type KeyInput={key:string;code?:string;ctrlKey:boolean;metaKey:boolean;altKey:boolean;shiftKey:boolean;isComposing?:boolean};
export function shortcutFromEvent(e:KeyInput):string|null{
  if(e.isComposing||["Dead","Process","Unidentified"].includes(e.key))return null;
  const code=e.code||(/^[a-z]$/i.test(e.key)?"Key"+e.key.toUpperCase():/^[0-9]$/.test(e.key)?"Digit"+e.key:e.key===" "?"Space":e.key);
  const value=[...(e.ctrlKey||e.metaKey?["Mod"]:[]),...(e.altKey?["Alt"]:[]),...(e.shiftKey?["Shift"]:[]),code].join("+");
  return validShortcut(value)?value:null;
}
export function shortcutAction(map:ShortcutMap,e:KeyInput){const value=shortcutFromEvent(e);return value?shortcutActions.find(([action])=>map[action].includes(value))?.[0]:undefined;}
export function readShortcuts(value:unknown):ShortcutMap{
  const defaults=defaultShortcuts(),input=value&&typeof value==="object"?value as Partial<ShortcutMap>:{},used=new Set<string>();
  for(const[action]of shortcutActions){const raw=input[action];defaults[action]=(Array.isArray(raw)?raw.filter(v=>validShortcut(v)&&!reservedShortcut(v)).slice(0,2):defaults[action]).filter(v=>{if(used.has(v))return false;used.add(v);return true;});}return defaults;
}
export function formatShortcut(value:string){
  const labels:Record<string,string>={Mod:"Ctrl / ⌘",ArrowLeft:"←",ArrowRight:"→",ArrowUp:"↑",ArrowDown:"↓",Escape:"Esc",Minus:"−",Equal:"=",BracketLeft:"[",BracketRight:"]",Backslash:"\\",Semicolon:";",Quote:"'",Comma:",",Period:".",Slash:"/",Backquote:"`",NumpadAdd:"テンキー +",NumpadSubtract:"テンキー −",NumpadMultiply:"テンキー ×",NumpadDivide:"テンキー ÷",NumpadDecimal:"テンキー .",NumpadEnter:"テンキー Enter"};
  return value.split("+").map(part=>labels[part]||(/^(Key[A-Z]|Digit[0-9])$/.test(part)?part.replace(/Key|Digit/,""):/^Numpad[0-9]$/.test(part)?"テンキー "+part.slice(-1):part)).join("+");
}
export function shortcutHint(map:ShortcutMap,action:ShortcutAction){return map[action].map(formatShortcut).join(" / ");}
export function shortcutTitle(label:string,map:ShortcutMap,action:ShortcutAction){const hint=shortcutHint(map,action);return hint?`${label} (${hint})`:label;}
export function nativeClipboardAction(e:KeyInput):"copy"|"cut"|"paste"|undefined{
  if(!(e.ctrlKey||e.metaKey)||e.altKey||e.shiftKey)return;
  return ({c:"copy",x:"cut",v:"paste"} as const)[e.key.toLowerCase() as "c"|"x"|"v"];
}
