/**
 * Tests for lib/api.ts — covers all critical fixes made during development.
 * Run: npx jest __tests__/api.test.ts
 */

// ── Mock AsyncStorage ─────────────────────────────────────────────────────────
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';

// Re-import module fresh for each test so module-level state is reset
let api: typeof import('../lib/api');

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  // Default session
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
    JSON.stringify({ deviceIp: '192.168.1.213', deviceName: 'Viviti Local', username: 'Prasad', deviceKey: 'TESTKEY' })
  );
  api = require('../lib/api');
});

// ── THUMB URL ─────────────────────────────────────────────────────────────────

describe('thumbUrl — cache busting and size cap', () => {
  test('viewer size (>400) includes v=2 cache buster', async () => {
    const url = await api.thumbUrl('Prasad', 'photo.jpg', 1080);
    expect(url).toContain('size=1080');
    expect(url).toContain('v=2');
  });

  test('grid size (≤400) does NOT include v param', async () => {
    const url = await api.thumbUrl('Prasad', 'photo.jpg', 200);
    expect(url).toContain('size=200');
    expect(url).not.toContain('v=');
  });

  test('URL includes device key as auth header param', async () => {
    const url = await api.thumbUrl('Prasad', 'photo.jpg', 200);
    expect(url).toContain('key=TESTKEY');
  });

  test('thumbUrlSync returns null before session is cached', () => {
    // Session not yet loaded — syncBase has no IP
    const url = api.thumbUrlSync('Prasad', 'photo.jpg', 200);
    expect(url).toBeNull();
  });

  test('thumbUrlSync returns URL after session is cached via cachedSession', async () => {
    await api.thumbUrl('Prasad', 'photo.jpg', 200); // warms the cache
    const url = api.thumbUrlSync('Prasad', 'photo.jpg', 200);
    expect(url).not.toBeNull();
    expect(url).toContain('192.168.1.213');
  });

  test('thumbUrlSync viewer URL includes v=2', async () => {
    await api.thumbUrl('x', 'x.jpg', 1080); // warm cache
    const url = api.thumbUrlSync('Prasad', 'photo.jpg', 1080);
    expect(url).toContain('v=2');
  });
});

// ── SESSION CACHE ─────────────────────────────────────────────────────────────

describe('session cache — invalidateSessionCache', () => {
  test('AsyncStorage is only called once when thumbUrl is called multiple times', async () => {
    await api.thumbUrl('a', 'a.jpg', 200);
    await api.thumbUrl('b', 'b.jpg', 200);
    await api.thumbUrl('c', 'c.jpg', 200);
    // loadSession (AsyncStorage.getItem) should only be called once due to cache
    expect(AsyncStorage.getItem).toHaveBeenCalledTimes(1);
  });

  test('invalidateSessionCache forces re-read from AsyncStorage', async () => {
    await api.thumbUrl('a', 'a.jpg', 200);
    api.invalidateSessionCache();
    await api.thumbUrl('b', 'b.jpg', 200);
    expect(AsyncStorage.getItem).toHaveBeenCalledTimes(2);
  });

  test('invalidateSessionCache clears discovered IP override', async () => {
    // Warm cache then invalidate
    await api.thumbUrl('a', 'a.jpg', 200);
    api.invalidateSessionCache();
    // After invalidation, sync URL should be null (cache cleared)
    const url = api.thumbUrlSync('a', 'a.jpg', 200);
    expect(url).toBeNull();
  });
});

// ── PHOTO URL ─────────────────────────────────────────────────────────────────

describe('photoUrl and photoUrlSync', () => {
  test('photoUrl contains correct device IP', async () => {
    const url = await api.photoUrl('Prasad', 'img.jpg');
    expect(url).toContain('192.168.1.213:3000');
    expect(url).toContain('/photos/file');
  });

  test('photoUrlSync returns null before cache is warm', () => {
    expect(api.photoUrlSync('a', 'b.jpg')).toBeNull();
  });

  test('photoUrlSync returns URL after cache is warm', async () => {
    await api.photoUrl('Prasad', 'img.jpg');
    expect(api.photoUrlSync('Prasad', 'img.jpg')).toContain('192.168.1.213');
  });
});
