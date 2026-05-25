import { loadSession } from './storage';

export interface Photo {
  name: string;
  size: number;
  modified: string;
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

export async function registerUser(ip: string, name: string): Promise<string> {
  const res = await fetchWithTimeout(`http://${ip}:3000/users/register`, 5000, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const res = await fetchWithTimeout(`${base}/status`, 5000);
  if (!res.ok) throw new Error('Device not reachable');
  return res.json();
}

export async function getFolders(folderPath: string): Promise<string[]> {
  const base = await deviceBase();
  const res = await fetchWithTimeout(
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
  const res = await fetchWithTimeout(`${base}/photos/folders`, 5000, {
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
  const res = await fetchWithTimeout(
    `${base}/photos?path=${encodeURIComponent(folderPath)}&offset=${offset}&limit=${limit}`, 8000,
  );
  if (!res.ok) throw new Error('Could not load photos');
  return res.json();
}

export async function photoUrl(folderPath: string, name: string): Promise<string> {
  const base = await deviceBase();
  return `${base}/photos/file?path=${encodeURIComponent(folderPath)}&name=${encodeURIComponent(name)}`;
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
  const res = await fetchWithTimeout(
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
    const res = await fetchWithTimeout(`${base}/photos/move`, 15000, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_path: fromPath, from_name: name, to_path: toPath }),
    });
    if (!res.ok) throw new Error(`Failed to move ${name}`);
  }
}

export async function deleteFolder(folderPath: string): Promise<void> {
  const base = await deviceBase();
  const res = await fetchWithTimeout(`${base}/photos/folders`, 10000, {
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
  const res = await fetchWithTimeout(`${base}/photos/files`, 10000, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: folderPath, names }),
  });
  if (!res.ok) throw new Error('Delete failed');
}
