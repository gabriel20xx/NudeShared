// Playlist test factory utilities
import http from 'http';
import { sessionUser } from './sessionFactory.mjs';
import { requestJson } from './requestUtils.mjs';

// Ensure we have a generic JSON requester (add lightweight if not present)

export async function ensureUserAndCreatePlaylist(base, { name = 'Test Playlist' } = {}) {
  const user = await sessionUser(base);
  const res = await requestJson(base + '/api/playlists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': user.cookie }
  }, JSON.stringify({ name }));
  if (res.status !== 200) throw new Error('Failed to create playlist: ' + res.status);
  const playlist = res.json?.data?.playlist;
  return { ...user, playlist };
}

export async function addPlaylistItem(base, playlistId, mediaKey, cookie){
  return await requestJson(base + `/api/playlists/${playlistId}/items`, {
    method:'POST', headers:{'Content-Type':'application/json','Cookie':cookie}
  }, JSON.stringify({ mediaKey }));
}

export async function listPlaylistItems(base, playlistId, cookie){
  return await requestJson(base + `/api/playlists/${playlistId}/items`, { method:'GET', headers:{'Cookie':cookie} });
}

export default { ensureUserAndCreatePlaylist, addPlaylistItem, listPlaylistItems };
