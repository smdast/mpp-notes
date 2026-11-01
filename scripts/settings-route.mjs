import {mkdir,copyFile} from "node:fs/promises";
await mkdir("dist/settings",{recursive:true});
await copyFile("dist/index.html","dist/settings/index.html");
