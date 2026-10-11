// Panelen kunnen in een eigen venster staan (Popouts.tsx). De componenten draaien dan nog steeds in het
// hoofdvenster, maar hun DOM staat in het andere venster: luister dus op het venster van het element.

/** Venster waarin een element staat (hoofdvenster of een los paneel). */
export const viewOf = (n?: Node | null): Window => (n?.ownerDocument?.defaultView as Window | null) ?? window

/** Document waarin het laatst geklikt is: daar opent het rechtermuismenu. */
let activeDoc: Document = typeof document !== 'undefined' ? document : (null as never)
export const getActiveDoc = () => activeDoc
export function trackActiveDoc(doc: Document) {
  const mark = () => (activeDoc = doc)
  doc.addEventListener('pointerdown', mark, true)
  doc.addEventListener('contextmenu', mark, true)
}
if (typeof document !== 'undefined') trackActiveDoc(document)
