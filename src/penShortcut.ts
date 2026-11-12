export const penShortcutGestures = [
  {id:"single", label:"1回押し", key:"F20"},
  {id:"double", label:"2回押し", key:"F19"},
  {id:"hold", label:"長押し", key:"F18"},
] as const;

export const penShortcutActions = [
  ["none","割り当てなし"],
  ["undo","元に戻す"],
  ["redo","やり直し"],
  ["pen","ペン"],
  ["marker","蛍光ペン"],
  ["eraser","消しゴム"],
  ["lasso","なげなわ選択"],
  ["hand","移動ツール"],
] as const;

export type PenShortcutGesture = typeof penShortcutGestures[number]["id"];
export type PenShortcutAction = typeof penShortcutActions[number][0];
export type PenShortcuts = Record<PenShortcutGesture, PenShortcutAction>;

export function readPenShortcuts(value:unknown):PenShortcuts {
  const result:PenShortcuts={single:"none",double:"none",hold:"none"};
  if(!value||typeof value!=="object")return result;
  const input=value as Partial<PenShortcuts>;
  for(const {id} of penShortcutGestures){
    const action=input[id];
    if(action&&penShortcutActions.some(([candidate])=>candidate===action))result[id]=action;
  }
  return result;
}

type PenShortcutKey = Pick<KeyboardEvent,"key"|"code"|"ctrlKey"|"altKey"|"shiftKey"|"metaKey"|"isComposing">;

export function penShortcutGesture(event:PenShortcutKey):PenShortcutGesture|undefined {
  if(event.isComposing||event.ctrlKey)return;
  const remapped=event.altKey&&event.shiftKey&&!event.metaKey;
  const original=event.metaKey&&!event.altKey&&!event.shiftKey;
  if(!remapped&&!original)return;
  return penShortcutGestures.find(({key})=>key===event.code||key===event.key)?.id;
}
