/**
 * Tests for components/SmartImage.tsx
 * Covers: navigation fix (URI updates on prop change), cache policy, sync URL init.
 */
import React from 'react';
import { render, act } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(
    JSON.stringify({ deviceIp: '10.0.0.1', deviceName: 'V', username: 'u', deviceKey: 'k' })
  ),
  setItem: jest.fn(),
}));

// Mock api URL builders
jest.mock('../lib/api', () => ({
  thumbUrlSync: jest.fn((folder, name, size) =>
    size > 400
      ? `http://10.0.0.1:3000/photos/thumb?path=${folder}&name=${name}&size=${size}&v=2`
      : `http://10.0.0.1:3000/photos/thumb?path=${folder}&name=${name}&size=${size}`
  ),
  photoUrlSync: jest.fn((folder, name) =>
    `http://10.0.0.1:3000/photos/file?path=${folder}&name=${name}`
  ),
  thumbUrl: jest.fn((folder, name, size) =>
    Promise.resolve(`http://10.0.0.1:3000/photos/thumb?path=${folder}&name=${name}&size=${size}`)
  ),
  photoUrl: jest.fn((folder, name) =>
    Promise.resolve(`http://10.0.0.1:3000/photos/file?path=${folder}&name=${name}`)
  ),
}));

import SmartImage from '../components/SmartImage';
import { thumbUrlSync, thumbUrl } from '../lib/api';

describe('SmartImage', () => {
  it('renders null when thumbUrlSync returns null (session not cached)', () => {
    (thumbUrlSync as jest.Mock).mockReturnValueOnce(null);
    (thumbUrl as jest.Mock).mockReturnValueOnce(new Promise(() => {})); // never resolves
    const { queryByTestId } = render(
      <SmartImage folderPath="Prasad" photoName="a.jpg" style={{}} thumb size={200} />
    );
    // No image visible until URI resolves
    expect(queryByTestId('smart-image')).toBeNull();
  });

  it('uses force-cache for grid thumbnails (size ≤ 400)', async () => {
    const { UNSAFE_getByType } = render(
      <SmartImage folderPath="Prasad" photoName="a.jpg" style={{}} thumb size={200} />
    );
    const { Image } = require('react-native');
    const img = UNSAFE_getByType(Image);
    expect(img.props.source.cache).toBe('force-cache');
  });

  it('uses default cache for viewer thumbnails (size > 400)', async () => {
    const { UNSAFE_getByType } = render(
      <SmartImage folderPath="Prasad" photoName="a.jpg" style={{}} thumb size={1080} />
    );
    const { Image } = require('react-native');
    const img = UNSAFE_getByType(Image);
    expect(img.props.source.cache).toBe('default');
  });

  it('updates URI when photoName changes — navigation fix', async () => {
    const { rerender, UNSAFE_getByType } = render(
      <SmartImage folderPath="Prasad" photoName="photo1.jpg" style={{}} thumb size={1080} />
    );
    const { Image } = require('react-native');
    const imgBefore = UNSAFE_getByType(Image);
    const uriBefore = imgBefore.props.source.uri;

    await act(async () => {
      rerender(
        <SmartImage folderPath="Prasad" photoName="photo2.jpg" style={{}} thumb size={1080} />
      );
    });

    const imgAfter = UNSAFE_getByType(Image);
    const uriAfter = imgAfter.props.source.uri;

    // URI MUST change when photoName changes — old bug was it stayed the same
    expect(uriAfter).not.toBe(uriBefore);
    expect(uriAfter).toContain('photo2.jpg');
  });
});
