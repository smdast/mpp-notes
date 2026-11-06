import {it,expect} from "vitest";
import {releases,CURRENT_VERSION} from "./releases";
import {isNewerVersion,validVersion} from "./updates";
import {formatUpdated} from "./formatTime";
it("assigns unique ordered versions to the commit history and identifies the active release",()=>{
  expect(releases[0].version).toBe(CURRENT_VERSION);
  expect(new Set(releases.map(r=>r.version)).size).toBe(releases.length);
  for(let i=0;i<releases.length;i++){
    expect(validVersion(releases[i].version)).toBe(true);expect(Number.isFinite(new Date(releases[i].date).getTime())).toBe(true);
    for(const commit of releases[i].commits)expect(commit).toMatch(/^[0-9a-f]{7}$/);
    if(i)expect(isNewerVersion(releases[i-1].version,releases[i].version)).toBe(true);
  }
  expect(releases.find(r=>r.commits.includes("d963758"))).toMatchObject({version:"1.16.1",legacyVersion:"1.0.1"});
});
it("formats the last update with date, hours, minutes and seconds",()=>{
  const value=formatUpdated(new Date(2026,10,6,14,25,36).getTime());expect(value).toContain("2026");expect(value).toContain("14:25:36");expect(formatUpdated(NaN)).toBe("更新時刻不明");
});
