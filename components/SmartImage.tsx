import React, { useEffect, useState } from 'react';
import { Image, ImageStyle } from 'react-native';
import { photoUrl, thumbUrl, photoUrlSync, thumbUrlSync } from '../lib/api';

interface Props {
  folderPath: string;
  photoName: string;
  style: ImageStyle | ImageStyle[];
  resizeMode?: 'contain' | 'cover' | 'stretch' | 'center';
  thumb?: boolean;
}

export default function SmartImage({ folderPath, photoName, style, resizeMode = 'cover', thumb = false }: Props) {
  // Try sync first — works immediately if session is already cached (after first API call).
  // Falls back to async only on first app load before cache is warm.
  const [uri, setUri] = useState<string | null>(() =>
    thumb ? thumbUrlSync(folderPath, photoName, 200) : photoUrlSync(folderPath, photoName),
  );

  useEffect(() => {
    if (uri) return; // Already resolved synchronously
    const fn = thumb ? thumbUrl(folderPath, photoName, 200) : photoUrl(folderPath, photoName);
    fn.then(setUri).catch(() => {});
  }, [folderPath, photoName, thumb]);

  if (!uri) return null;

  return (
    <Image
      source={{ uri, cache: 'force-cache' }}
      style={style as any}
      resizeMode={resizeMode}
    />
  );
}
