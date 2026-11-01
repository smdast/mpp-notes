import {it,expect} from "vitest";
import {newPage,type Page} from "./model";
import {reorderPages,duplicatePage,insertedPage} from "./pages";
import {makeBackup,readBackupBundle} from "./backup";
import {newNote} from "./model";
it("reorders in both directions and preserves identities, PDF mapping and active-page IDs",()=>{
 const pages=[newPage(),{...newPage(),pdfIndex:4},newPage(),newPage()];
 const result=reorderPages(pages,pages[0].id,pages[2].id,true);
 expect(result).toEqual([pages[1],pages[2],pages[0],pages[3]]);
 const back=reorderPages(result,pages[3].id,pages[1].id,false);
 expect(back[0]).toBe(pages[3]);expect(back[1].pdfIndex).toBe(4);
 expect(reorderPages(pages,pages[0].id,pages[0].id)).toBe(pages);
 expect(reorderPages(pages,pages[0].id,pages[1].id,false)).toBe(pages);
 expect(reorderPages(pages,"missing",pages[0].id)).toBe(pages);
});
it("inserts before/after with the adjacent template without copying writing or PDF content",()=>{
 const first={...newPage(),paper:"ruled" as const,paperColor:"#fff7dc"},second={...newPage(),paper:"blank" as const};
 const before=insertedPage([first,second],second.id,false,true)!;
 expect(before.pages[1]).toBe(before.page);expect(before.page.paper).toBe("ruled");expect(before.page.paperColor).toBe("#fff7dc");
 const after=insertedPage([first,second],second.id,true,true)!;
 expect(after.pages[2]).toBe(after.page);expect(after.page.paper).toBe("blank");
 expect(insertedPage([first],"missing",true,false)).toBeNull();
 const pdf=insertedPage([{...first,pdfIndex:2}],first.id,true,false)!;
 expect(pdf.page.pdfIndex).toBeUndefined();expect(pdf.page.strokes).toEqual([]);
});
it("duplicates PDF and image annotations independently and round trips the new order in backups",()=>{
 const page:Page={...newPage(),pdfIndex:0,strokes:[{id:"ink",tool:"pen",color:"#123456",width:3,dashed:true,points:[{x:10,y:20,p:.5},{x:30,y:40,p:.8}]}]};
 const copy=duplicatePage(page);expect(copy.id).not.toBe(page.id);expect(copy.pdfIndex).toBe(0);expect(copy.strokes[0].id).not.toBe(page.strokes[0].id);
 copy.strokes[0].points[0].x=99;expect(page.strokes[0].points[0].x).toBe(10);
 const note=newNote();note.pages=[copy,page];note.pdf=new TextEncoder().encode("%PDF-test");
 const restored=readBackupBundle(makeBackup([note]),true).notes[0];
 expect(restored.pages.map(p=>p.id)).toEqual([copy.id,page.id]);expect(restored.pages[0].strokes[0].dashed).toBe(true);
});
