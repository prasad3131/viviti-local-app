import { loadSession, saveSession } from './storage';

// ─── subnet discovery ────────────────────────────────────────────────────────
const SCAN_TIMEOUT_MS = 1200;
const SCAN_BATCH      = 50;

function buildScanList(): string[] {
  const ips: string[] = [];
  for (const sub of ['192.168.1', '192.168.0']) {
    for (let i = 100; i <= 254; i++) ips.push(`${sub}.${i}`);
  }
  for (const sub of ['192.168.1', '192.168.0']) {
    for (let i = 1; i <= 99; i++) ips.push(`${sub}.${i}`);
  }
  ips.unshift('10.42.0.1');
  return ips;
}

function probeIp(ip: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SCAN_TIMEOUT_MS);
    fetch(`http://${ip}:3000/health`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(data => { clearTimeout(timer); data?.viviti === true ? resolve(ip) : reject(); })
      .catch(() => { clearTimeout(timer); reject(); });
  });
}

// In-session IP override — updated whenever we rediscover a new address
let _discoveredIp: string | null = null;

// Session cache — AsyncStorage is slow; reading it for every thumbnail URL kills grid perf
type Session = Awaited<ReturnType<typeof loadSession>>;
let _sessionCache: Session | undefined = undefined;

async function cachedSession(): Promise<Session> {
  if (_sessionCache !== undefined) return _sessionCache;
  _sessionCache = await loadSession();
  return _sessionCache;
}

// Call this whenever a new session is saved outside api.ts (e.g. SetupScreen)
export function invalidateSessionCache() {
  _sessionCache = undefined;
  _discoveredIp = null;
}

async function rediscoverDevice(): Promise<string | null> {
  const allIps = buildScanList();
  for (let i = 0; i < allIps.length; i += SCAN_BATCH) {
    try {
      const ip = await Promise.any(allIps.slice(i, i + SCAN_BATCH).map(probeIp));
      _discoveredIp = ip;
      // Update cache and persist
      const s = await cachedSession();
      if (s) {
        _sessionCache = { ...s, deviceIp: ip };
        saveSession(_sessionCache).catch(() => {});
      }
      return ip;
    } catch { /* batch had no Viviti device — continue */ }
  }
  return null;
}
// ─────────────────────────────────────────────────────────────────────────────

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
export interface SearchPhoto { photo_path: string; folder: string; name: string; matched_objects: string[]; person?: string; }
export interface ObjectLabel { label: string; count: number; }

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
  if (_discoveredIp) return `http://${_discoveredIp}:3000`;
  const s = await cachedSession();
  if (!s?.deviceIp) throw new Error('No device configured. Go to Settings and enter the device IP.');
  return `http://${s.deviceIp}:3000`;
}

function fetchWithTimeout(url: string, ms: number, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// Authenticated fetch — automatically injects X-Viviti-Key from the saved session.
// On network failure or timeout, does a quick health check to decide whether to
// rediscover (IP changed) or surface the error (device genuinely unreachable/slow).
async function deviceFetch(url: string, ms: number, options?: RequestInit): Promise<Response> {
  const s = await cachedSession();
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> || {}),
    ...(s?.deviceKey ? { 'X-Viviti-Key': s.deviceKey } : {}),
  };
  try {
    return await fetchWithTimeout(url, ms, { ...options, headers });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      // Timeout — could be IP changed (old IP hangs) or device just slow.
      // Quick 1.5s health ping to distinguish the two cases.
      const currentBase = _discoveredIp
        ? `http://${_discoveredIp}:3000`
        : `http://${s?.deviceIp}:3000`;
      const alive = await fetchWithTimeout(`${currentBase}/health`, 1500)
        .then(r => r.ok).catch(() => false);
      if (alive) throw err; // device responded — it was just slow, surface error
    }
    const newIp = await rediscoverDevice();
    if (!newIp) throw err;
    const retryUrl = url.replace(/^http:\/\/[^/]+/, `http://${newIp}:3000`);
    return fetchWithTimeout(retryUrl, ms, { ...options, headers });
  }
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

async function resolvedBase(): Promise<{ base: string; key: string }> {
  const s = await cachedSession();
  const ip = _discoveredIp || s?.deviceIp;
  return {
    base: `http://${ip}:3000`,
    key: s?.deviceKey ? s.deviceKey : '',
  };
}

// Synchronous URL builders — only work after the session is cached (i.e. after
// the first API call). SmartImage uses these to avoid an async round-trip per cell.
function syncBase(): { base: string; key: string } | null {
  const ip = _discoveredIp || _sessionCache?.deviceIp;
  if (!ip) return null;
  return { base: `http://${ip}:3000`, key: _sessionCache?.deviceKey ?? '' };
}

// v=2 busts the phone HTTP cache for thumbnails generated before fit:inside fix
const THUMB_VERSION = 2;

export function thumbUrlSync(folderPath: string, name: string, size = 200): string | null {
  const b = syncBase();
  if (!b) return null;
  const k = b.key ? `&key=${encodeURIComponent(b.key)}` : '';
  const v = size > 400 ? `&v=${THUMB_VERSION}` : '';
  return `${b.base}/photos/thumb?path=${encodeURIComponent(folderPath)}&name=${encodeURIComponent(name)}&size=${size}${k}${v}`;
}

export function photoUrlSync(folderPath: string, name: string): string | null {
  const b = syncBase();
  if (!b) return null;
  const k = b.key ? `&key=${encodeURIComponent(b.key)}` : '';
  return `${b.base}/photos/file?path=${encodeURIComponent(folderPath)}&name=${encodeURIComponent(name)}${k}`;
}

export async function photoUrl(folderPath: string, name: string): Promise<string> {
  const { base, key } = await resolvedBase();
  const k = key ? `&key=${encodeURIComponent(key)}` : '';
  return `${base}/photos/file?path=${encodeURIComponent(folderPath)}&name=${encodeURIComponent(name)}${k}`;
}

export async function videoUrl(folderPath: string, name: string): Promise<string> {
  const { base, key } = await resolvedBase();
  const k = key ? `&key=${encodeURIComponent(key)}` : '';
  return `${base}/photos/file?path=${encodeURIComponent(folderPath)}&name=${encodeURIComponent(name)}${k}`;
}

export async function thumbUrl(folderPath: string, name: string, size = 200): Promise<string> {
  const { base, key } = await resolvedBase();
  const k = key ? `&key=${encodeURIComponent(key)}` : '';
  const v = size > 400 ? `&v=${THUMB_VERSION}` : '';
  return `${base}/photos/thumb?path=${encodeURIComponent(folderPath)}&name=${encodeURIComponent(name)}&size=${size}${k}${v}`;
}

export async function uploadPhotos(
  folderPath: string,
  assets: Array<{ uri: string; name: string; type: string }>,
  onProgress?: (fraction: number, index: number, total: number) => void,
): Promise<void> {
  const base = await deviceBase();
  const s = await cachedSession();
  const key = s?.deviceKey;
  // One file at a time, via XMLHttpRequest so we can report upload progress
  // (fetch can't). Generous timeouts — the Pi's WiFi is the bottleneck.
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const isVideo = /^video\//i.test(asset.type) || /\.(mp4|mov|m4v|3gp|avi|mkv|webm)$/i.test(asset.name);
    await new Promise<void>((resolve, reject) => {
      const form = new FormData();
      form.append('photos', { uri: asset.uri, name: asset.name, type: asset.type } as any);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${base}/photos/upload?path=${encodeURIComponent(folderPath)}`);
      if (key) xhr.setRequestHeader('X-Viviti-Key', key);
      xhr.timeout = isVideo ? 600_000 : 120_000;
      xhr.upload.onprogress = e => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total, i, assets.length);
      };
      xhr.onload = () =>
        (xhr.status >= 200 && xhr.status < 300)
          ? resolve()
          : reject(new Error(`Failed to upload ${asset.name}`));
      xhr.onerror   = () => reject(new Error(`Failed to upload ${asset.name}`));
      xhr.ontimeout = () => reject(new Error(`Upload timed out: ${asset.name}`));
      xhr.send(form as any);
    });
  }
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
  const { base, key } = await resolvedBase();
  const k = key ? `?key=${encodeURIComponent(key)}` : '';
  return `${base}/ai/faces/thumb/${encodeURIComponent(filename)}${k}`;
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

// Object Search — searches on-device object labels (no photo leaves the device)
export async function searchPhotos(query: string, path?: string): Promise<SearchPhoto[]> {
  const q = query.trim();
  if (!q) return [];
  const base = await deviceBase();
  const p = path ? `&path=${encodeURIComponent(path)}` : '';
  const res = await deviceFetch(`${base}/ai/search?q=${encodeURIComponent(q)}${p}`, 12000);
  if (!res.ok) return [];
  const { photos } = await res.json();
  return photos ?? [];
}

export async function getObjectLabels(): Promise<ObjectLabel[]> {
  const base = await deviceBase();
  const res = await deviceFetch(`${base}/ai/objects`, 12000);
  if (!res.ok) return [];
  const { objects } = await res.json();
  return objects ?? [];
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
