import React, { useEffect, useState } from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';
import { photoUrl, thumbUrl, photoUrlSync, thumbUrlSync } from '../lib/api';

interface Props {
  folderPath: string;
  photoName: string;
  style: StyleProp<ImageStyle>;
  resizeMode?: 'contain' | 'cover' | 'stretch' | 'center';
  thumb?: boolean;
  size?: number;
}

export default function SmartImage({
  folderPath, photoName, style, resizeMode = 'cover', thumb = false, size = 200,
}: Props) {
  const [uri, setUri] = useState<string | null>(() =>
    thumb ? thumbUrlSync(folderPath, photoName, size) : photoUrlSync(folderPath, photoName),
  );

  useEffect(() => {
    if (uri) return;
    const fn = thumb ? thumbUrl(folderPath, photoName, size) : photoUrl(folderPath, photoName);
    fn.then(setUri).catch(() => {});
  }, [folderPath, photoName, thumb, size]);

  if (!uri) return null;

  return (
    <Image
      source={{ uri, cache: 'force-cache' }}
      style={style as any}
      resizeMode={resizeMode}
    />
  );
}
