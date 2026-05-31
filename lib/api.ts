import { loadSession } from './storage';

export interface Photo {
  name: string;
  size: number;
  modified: string;
  isVideo?: boolean;
}

export interface PhotoExif {
  width: number; height: number; file_size: number;
  date_taken: string | null; camera_make: string | null; camera_model: string | null;
  focal_length: number | null; f_number: number | null; iso: number | null;
  exposure_time: string | null; gps_lat: number | null; gps_lon: number | null;
  error?: string;
}

export interface Album { key: string; cover: string; count: number; }
export interface AlbumPhoto { photo_path: string; folder: string; name: string; }
export interface Highlight { photo_path: string; folder: string; name: string; }

export interface CritiqueIssue {
  sev: 'high' | 'medium' | 'low' | 'none';
  msg: string;
}

export interface CritiqueResult {
  score: number;
  blur_score: number;
  brightness: number;
  noise: number;
  orientation: string;
  aspect_ratio: string;
  mood: string;
  mood_desc: string;
  composition_feel: string;
  technical: CritiqueIssue[];
  artistic: CritiqueIssue[];
  good_points: string[];
  improvements: CritiqueIssue[];
  overall: string;
  issues: CritiqueIssue[];
  error?: string;
}

async function deviceBase(): Promise<string> {
  const s = await loadSession();
  if (!s?.deviceIp) throw new Error('No device configured. Go to Settings and enter the device IP.');
  return `http://${s.deviceIp}:3000`;
}

function fetchWithTimeout(url: string, ms: number, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// Authenticated fetch — automatically injects X-Viviti-Key from the saved session
async function deviceFetch(url: string, ms: number, options?: RequestInit): Promise<Response> {
  const s = await loadSession();
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> || {}),
    ...(s?.deviceKey ? { 'X-Viviti-Key': s.deviceKey } : {}),
  };
  return fetchWithTimeout(url, ms, { ...options, headers });
}

export async function registerUser(ip: string, name: string, deviceKey: string): Promise<string> {
  const res = await fetchWithTimeout(`http://${ip}:3000/users/register`, 5000, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Viviti-Key': deviceKey },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not create profile');
  return data.name as string;
}

export async function checkDevice(ip: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`http://${ip}:3000/health`, 4000);
    return res.ok;
  } catch {
    return false;
  }
}

export async function getDeviceStatus() {
  const base = await deviceBase();
  const res = await deviceFetch(`${base}/status`, 5000);
  if (!res.ok) throw new Error('Device not reachable');
  return res.json();
}

export async function getFolders(folderPath: string): Promise<string[]> {
  const base = await deviceBase();
  const res = await deviceFetch(
    `${base}/photos/folders?path=${encodeURIComponent(folderPath)}`, 5000,
  );
  if (!res.ok) throw new Error('Could not load folders');
  const { folders } = await res.json();
  return folders;
}

export async function createFolder(
  parentPath: string, name: string,
): Promise<{ ok?: boolean; error?: string }> {
  const base = await deviceBase();
  const res = await deviceFetch(`${base}/photos/folders`, 5000, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: parentPath, name }),
  });
  return res.json();
}

export async function getPhotos(
  folderPath: string, offset: number, limit = 10,
): Promise<{ photos: Photo[]; total: number }> {
  const base = await deviceBase();
  const res = await deviceFetch(
    `${base}/photos?path=${encodeURIComponent(folderPath)}&offset=${offset}&limit=${limit}`, 8000,
  );
  if (!res.ok) throw new Error('Could not load photos');
  return res.json();
}

export async function photoUrl(folderPath: string, name: string): Promise<string> {
  const s = await loadSession();
  const base = `http://${s?.deviceIp}:3000`;
  const key = s?.deviceKey ? `&key=${encodeURIComponent(s.deviceKey)}` : '';
  return `${base}/photos/file?path=${encodeURIComponent(folderPath)}&name=${encodeURIComponent(name)}${key}`;
}

export async function videoUrl(folderPath: string, name: string): Promise<string> {
  const s = await loadSession();
  const base = `http://${s?.deviceIp}:3000`;
  const key = s?.deviceKey ? `&key=${encodeURIComponent(s.deviceKey)}` : '';
  return `${base}/photos/file?path=${encodeURIComponent(folderPath)}&name=${encodeURIComponent(name)}${key}`;
}

export async function thumbUrl(folderPath: string, name: string, size = 200): Promise<string> {
  const s = await loadSession();
  const base = `http://${s?.deviceIp}:3000`;
  const key = s?.deviceKey ? `&key=${encodeURIComponent(s.deviceKey)}` : '';
  return `${base}/photos/thumb?path=${encodeURIComponent(folderPath)}&name=${encodeURIComponent(name)}&size=${size}${key}`;
}

export async function uploadPhotos(
  folderPath: string,
  assets: Array<{ uri: string; name: string; type: string }>,
): Promise<void> {
  const base = await deviceBase();
  const form = new FormData();
  for (const asset of assets) {
    form.append('photos', { uri: asset.uri, name: asset.name, type: asset.type } as any);
  }
  const res = await deviceFetch(
    `${base}/photos/upload?path=${encodeURIComponent(folderPath)}`,
    30000,
    { method: 'POST', body: form },
  );
  if (!res.ok) throw new Error('Upload failed');
}

export async function movePhotos(
  fromPath: string,
  names: string[],
  toPath: string,
): Promise<void> {
  const base = await deviceBase();
  for (const name of names) {
    const res = await deviceFetch(`${base}/photos/move`, 15000, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_path: fromPath, from_name: name, to_path: toPath }),
    });
    if (!res.ok) throw new Error(`Failed to move ${name}`);
  }
}

export async function deleteFolder(folderPath: string): Promise<void> {
  const base = await deviceBase();
  const res = await deviceFetch(`${base}/photos/folders`, 10000, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: folderPath }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || 'Delete folder failed');
  }
}

export async function deletePhotos(folderPath: string, names: string[]): Promise<void> {
  const base = await deviceBase();
  const res = await deviceFetch(`${base}/photos/files`, 10000, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: folderPath, names }),
  });
  if (!res.ok) throw new Error('Delete failed');
}

export interface AiTag { tag: string; count: number; }
export interface TaggedPhoto { photo_path: string; folder: string; name: string; }

export async function getAiTags(folderPath: string): Promise<AiTag[]> {
  const base = await deviceBase();
  const res = await deviceFetch(
    `${base}/ai/tags?path=${encodeURIComponent(folderPath)}`, 8000,
  );
  if (!res.ok) return [];
  const { tags } = await res.json();
  return tags ?? [];
}

export async function getTaggedPhotos(
  tag: string, folderPath: string,
): Promise<TaggedPhoto[]> {
  const base = await deviceBase();
  const res = await deviceFetch(
    `${base}/ai/tagged?tag=${encodeURIComponent(tag)}&path=${encodeURIComponent(folderPath)}`, 8000,
  );
  if (!res.ok) return [];
  const { photos } = await res.json();
  return photos ?? [];
}

export interface FaceCluster { id: number; name: string | null; sample_thumb: string | null; photo_count: number; }
export interface FacePhoto { photo_path: string; folder: string; name: string; }

export async function getFaces(): Promise<FaceCluster[]> {
  const base = await deviceBase();
  const res = await deviceFetch(`${base}/ai/faces`, 8000);
  if (!res.ok) return [];
  const { faces } = await res.json();
  return faces ?? [];
}

export async function deleteFaceCluster(id: number): Promise<void> {
  const base = await deviceBase();
  await deviceFetch(`${base}/ai/faces/${id}`, 5000, { method: 'DELETE' });
}

export async function setFaceName(id: number, name: string, thumbFilename?: string): Promise<void> {
  const base = await deviceBase();
  await deviceFetch(`${base}/ai/faces/${id}`, 5000, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, ...(thumbFilename ? { thumb_filename: thumbFilename } : {}) }),
  });
}

export async function getFacePhotos(id: number): Promise<FacePhoto[]> {
  const base = await deviceBase();
  const res = await deviceFetch(`${base}/ai/faces/${id}/photos`, 8000);
  if (!res.ok) return [];
  const { photos } = await res.json();
  return photos ?? [];
}

export async function faceThumbnailUrl(filename: string): Promise<string> {
  const s = await loadSession();
  const base = `http://${s?.deviceIp}:3000`;
  const key = s?.deviceKey ? `?key=${encodeURIComponent(s.deviceKey)}` : '';
  return `${base}/ai/faces/thumb/${encodeURIComponent(filename)}${key}`;
}

export async function triggerFaceBatch(): Promise<void> {
  const base = await deviceBase();
  await deviceFetch(`${base}/ai/faces/run`, 5000, { method: 'POST' });
}

export interface DetectedFace {
  x: number; y: number; w: number; h: number;
  cluster_id: number;
  cluster_name: string | null;
  thumb_filename: string | null;
}

export async function getPhotoExif(folderPath: string, name: string): Promise<PhotoExif> {
  const base = await deviceBase();
  const res = await deviceFetch(
    `${base}/photos/exif?path=${encodeURIComponent(folderPath)}&name=${encodeURIComponent(name)}`, 10000,
  );
  if (!res.ok) throw new Error('EXIF fetch failed');
  return res.json();
}

export async function getAlbums(): Promise<Album[]> {
  const base = await deviceBase();
  const res = await deviceFetch(`${base}/ai/albums`, 10000);
  if (!res.ok) return [];
  const { albums } = await res.json();
  return albums ?? [];
}

export async function getAlbumPhotos(key: string): Promise<AlbumPhoto[]> {
  const base = await deviceBase();
  const res = await deviceFetch(`${base}/ai/albums/${encodeURIComponent(key)}/photos`, 10000);
  if (!res.ok) return [];
  const { photos } = await res.json();
  return photos ?? [];
}

export async function getHighlights(): Promise<Highlight[]> {
  const base = await deviceBase();
  const res = await deviceFetch(`${base}/ai/highlights`, 15000);
  if (!res.ok) return [];
  const { highlights } = await res.json();
  return highlights ?? [];
}

export async function detectPhotoFaces(
  folderPath: string, name: string,
): Promise<DetectedFace[]> {
  const base = await deviceBase();
  const res = await deviceFetch(`${base}/ai/faces/detect-photo`, 30000, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: folderPath, name }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.faces ?? [];
}

export interface WifiNetwork { ssid: string; signal: number; security: string; }
export type WifiMode = 'ap' | 'client';

export async function getDeviceHealth(ip: string): Promise<{ viviti: boolean; mode: WifiMode; key?: string }> {
  try {
    const res = await fetchWithTimeout(`http://${ip}:3000/health`, 4000);
    if (!res.ok) return { viviti: false, mode: 'client' };
    return res.json();
  } catch {
    return { viviti: false, mode: 'client' };
  }
}

export async function getWifiNetworks(ip: string, rescan = false): Promise<WifiNetwork[]> {
  const url = `http://${ip}:3000/system/wifi/networks${rescan ? '?rescan=true' : ''}`;
  const res = await fetchWithTimeout(url, rescan ? 20000 : 5000);
  if (!res.ok) throw new Error('Scan failed');
  return res.json();
}

export async function connectToWifi(ip: string, ssid: string, password: string): Promise<void> {
  await fetchWithTimeout(`http://${ip}:3000/system/wifi/connect`, 5000, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ssid, password }),
  });
}

export async function critiquePhoto(
  folderPath: string,
  name: string,
): Promise<CritiqueResult> {
  const base = await deviceBase();
  const res = await deviceFetch(`${base}/ai/critique`, 20000, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: folderPath, name }),
  });
  if (!res.ok) throw new Error('Critique request failed');
  return res.json();
}
