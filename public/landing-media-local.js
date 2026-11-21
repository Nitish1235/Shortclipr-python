// Browser-only media storage for the local demo. Production uses the signed API.
const databaseName = 'shortclipr-local-landing-media';
const cachedUrls = new Map();
const changes = typeof BroadcastChannel === 'function' ? new BroadcastChannel(databaseName) : null;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('placements', {keyPath:'slot'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Browser storage is unavailable. Please allow local storage for the preview.'));
  });
}
async function transaction(mode, operation) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('placements', mode);
      const request = operation(tx.objectStore('placements'));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error || new Error('Could not save the local image.'));
      tx.onabort = () => reject(tx.error || new Error('Could not save the local image. Browser storage may be full.'));
    });
  } finally { db.close(); }
}
export async function readLocalMedia() {
  const rows = await transaction('readonly', store => store.getAll());
  const active = new Set(rows.map(row => row.id));
  for (const [id, url] of cachedUrls) {
    if (!active.has(id)) { URL.revokeObjectURL(url); cachedUrls.delete(id); }
  }
  return rows.map(({file, ...row}) => {
    if (!cachedUrls.has(row.id)) cachedUrls.set(row.id, URL.createObjectURL(file));
    return {...row, mediaUrl:cachedUrls.get(row.id)};
  });
}
export async function saveLocalMedia(form) {
  const file = form.get('media');
  const slot = String(form.get('slot'));
  if (!(file instanceof File) || !file.size) throw new Error('Choose an image or video first.');
  if (file.size > 50 * 1024 * 1024) throw new Error('Choose a file smaller than 50 MB.');
  const images = ['image/jpeg','image/png','image/webp'];
  const imageOnly = slot.startsWith('landing_thumbnail_') || slot.startsWith('collection_') || slot === 'landing_hero_machine';
  const videoOnly = slot === 'landing_hero_clip';
  const videos = ['video/mp4','video/webm','video/quicktime'];
  const allowed = videoOnly ? videos : imageOnly ? images : [...images,...videos];
  if (!allowed.includes(file.type)) throw new Error('This file format is not supported for this placement.');
  const row = {id:crypto.randomUUID(), slot, title:String(form.get('title') || 'ShortClipr image'), caption:String(form.get('caption') || ''), mediaKind:file.type.startsWith('video/')?'video':'image', createdAt:new Date().toISOString(), file};
  await transaction('readwrite', store => store.put(row));
  changes?.postMessage('updated');
  return (await readLocalMedia()).find(item => item.slot === slot);
}
export async function deleteLocalMedia(slot) {
  await transaction('readwrite', store => store.delete(slot));
  changes?.postMessage('updated');
}
export function subscribeLocalMedia(callback) {
  changes?.addEventListener('message', callback);
  return () => changes?.removeEventListener('message', callback);
}
window.shortcliprLocalMedia = {readLocalMedia, saveLocalMedia, deleteLocalMedia, subscribeLocalMedia};
