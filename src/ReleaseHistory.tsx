import {ExternalLink} from "lucide-react";
import {releases,CURRENT_VERSION} from "./releases";
export function ReleaseHistory(){
  return <section className="release-history" aria-label="更新履歴"><h3>更新履歴</h3><p className="history-note">過去の更新はGitHubの変更単位で番号を付け直しました。以前の表示「1.0.1」は、履歴上の「1.16.1」に対応します。1.17.0から履歴の番号をアプリにも表示しています。</p>
    {releases.map(release=><article key={release.version}><header><h4>v{release.version}{release.version===CURRENT_VERSION&&<span>現在のバージョン</span>}</h4><time dateTime={release.date}>{release.date.replaceAll("-","/")}</time></header><b>{release.title}</b>{release.legacyVersion&&<small>当時の表示：{release.legacyVersion}</small>}<ul>{release.changes.map(change=><li key={change}>{change}</li>)}</ul><div className="release-links">{release.commits.map(commit=><a href={`https://github.com/smdast/mpp-notes/commit/${commit}`} key={commit} target="_blank" rel="noreferrer">{commit}<ExternalLink size={11}/></a>)}</div></article>)}
  </section>;
}
