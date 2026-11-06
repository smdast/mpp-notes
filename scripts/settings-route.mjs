import {mkdir,copyFile,readFile,writeFile,appendFile} from "node:fs/promises";
await mkdir("dist/settings",{recursive:true});
await copyFile("dist/index.html","dist/settings/index.html");
const {version}=JSON.parse(await readFile("package.json","utf8"));
const release={format:"mpp-notes-release",version};
await writeFile("dist/version.json",JSON.stringify(release)+"\n");
await appendFile("dist/sw.js",`\nself.addEventListener('message',event=>{if(event.data?.type==='MPP_NOTES_VERSION')event.ports?.[0]?.postMessage(${JSON.stringify(release)});});\n`);
