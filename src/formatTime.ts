export function formatUpdated(time:number){
  const date=new Date(time);if(!Number.isFinite(date.getTime()))return "更新時刻不明";
  return date.toLocaleString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
}
export function isoUpdated(time:number){const date=new Date(time);return Number.isFinite(date.getTime())?date.toISOString():undefined;}
