import {it,expect} from "vitest";
import {pageGridSlot,pageDropTarget} from "./pageDrag";
import {reorderPages} from "./pages";
import {newPage} from "./model";
it("maps both columns and scrolled rows to a bounded insertion slot",()=>{
 expect(pageGridSlot(20,20,4,4,100,160,8,12,5)).toBe(0);
 expect(pageGridSlot(125,20,4,4,100,160,8,12,5)).toBe(1);
 expect(pageGridSlot(20,190,4,4,100,160,8,12,5)).toBe(2);
 expect(pageGridSlot(125,190,4,4,100,160,8,12,5)).toBe(3);
 expect(pageGridSlot(125,600,4,4,100,160,8,12,5)).toBe(4);
 expect(pageGridSlot(20,20,4,-168,100,160,8,12,5)).toBe(2);
 expect(pageGridSlot(-30,-30,4,4,100,160,8,12,5)).toBe(0);
});
it("commits every placeholder slot correctly in either direction without mutating pages",()=>{
 const pages=[newPage(),newPage(),newPage(),newPage(),newPage()];
 for(let source=0;source<pages.length;source++)for(let slot=0;slot<pages.length;slot++){
  const target=pageDropTarget(pages,pages[source].id,slot)!;
  const result=reorderPages(pages,pages[source].id,target.id,target.after);
  expect(result[slot]).toBe(pages[source]);expect(new Set(result).size).toBe(pages.length);
  expect(result.filter(p=>p!==pages[source])).toEqual(pages.filter(p=>p!==pages[source]));
 }
 expect(pageDropTarget(pages,"missing",0)).toBeNull();
 expect(pageDropTarget([pages[0]],pages[0].id,0)).toBeNull();
});
