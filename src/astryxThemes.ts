import {defineTheme} from "@astryxdesign/core/theme";
import {neutralTheme} from "@astryxdesign/theme-neutral/built";
// Extend the official theme so components and the legacy canvas chrome share tokens.
function noteTheme(name:string,hue:string){
 return defineTheme({name,extends:neutralTheme,tokens:{
  "--color-accent":`var(--color-text-${hue})`,
  "--color-text-accent":`var(--color-text-${hue})`,
  "--color-icon-accent":`var(--color-icon-${hue})`,
  "--color-accent-muted":`var(--color-background-${hue})`,
  "--color-on-accent":"var(--color-background-surface)",
 }});
}
export const noteThemes={green:noteTheme("notes-forest","teal"),blue:noteTheme("notes-blue","blue"),rose:noteTheme("notes-rose","pink")};
