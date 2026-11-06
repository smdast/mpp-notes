import {it,expect} from "vitest";
import {zipSync,unzipSync,strToU8} from "fflate";
import {makeNoteFile,readNoteFile,noteFilename} from "./noteFile";
import {makeBackup} from "./backup";
import {newNote} from "./model";
it("round-trips one complete editable note and gives each import fresh identities",()=>{
  const note=newNote("共有するノート");note.updated=1234567890000;note.folder="授業/数学";
  const image="data:image/png;base64,iVBORw0KGgo=";note.coverImage=image;note.pdf=strToU8("%PDF-1.7\nfixture");
  const page=note.pages[0];page.pdfIndex=0;page.paperColor="#1e2822";page.backgroundImage=image;
  page.strokes=[{id:"line",tool:"pen",color:"#ffffff",width:.2,pressure:true,dashed:true,shape:"line",points:[{x:2,y:3,p:.1},{x:100,y:90,p:1}]},{id:"image",image,tool:"pen",color:"#000000",width:1,points:[{x:0,y:0,p:.5},{x:10,y:0,p:.5},{x:10,y:10,p:.5},{x:0,y:10,p:.5}]}];
  const before=structuredClone(note),file=makeNoteFile(note),a=readNoteFile(file),b=readNoteFile(file);
  expect(a.id).not.toBe(note.id);expect(b.id).not.toBe(a.id);expect(a.pages[0].id).not.toBe(page.id);expect(a.pages[0].strokes[0].id).not.toBe("line");
  expect(a).toMatchObject({title:note.title,updated:note.updated,folder:note.folder,coverImage:image,pdf:note.pdf});
  expect(a.pages[0]).toMatchObject({paperColor:page.paperColor,backgroundImage:image,pdfIndex:0});
  expect(a.pages[0].strokes.map(({id,...s})=>s)).toEqual(page.strokes.map(({id,...s})=>s));expect(note).toEqual(before);
});
it("rejects ZIP backups, unsupported versions, multiple notes and malformed content",()=>{
  const note=newNote(),valid=unzipSync(makeNoteFile(note));
  expect(()=>readNoteFile(makeBackup([note]))).toThrow(".mppnote");
  expect(()=>readNoteFile(zipSync({...valid,"note-file.json":strToU8(JSON.stringify({format:"mpp-note",version:2}))}))).toThrow("未対応");
  const multiple=unzipSync(makeBackup([note,newNote()]));multiple["note-file.json"]=valid["note-file.json"];
  expect(()=>readNoteFile(zipSync(multiple))).toThrow();expect(()=>readNoteFile(new Uint8Array([1,2,3]))).toThrow();
  expect(noteFilename('数学/「問題」:1?')).toBe('数学_「問題」_1_.mppnote');
});
