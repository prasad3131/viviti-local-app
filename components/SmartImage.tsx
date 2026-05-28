import React, { useEffect, useState } from 'react';
import { Image, ImageStyle } from 'react-native';
import { photoUrl, thumbUrl } from '../lib/api';

interface Props {
  folderPath: string;
  photoName: string;
  style: ImageStyle | ImageStyle[];
  resizeMode?: 'contain' | 'cover' | 'stretch' | 'center';
  thumb?: boolean;
}

export default function SmartImage({ folderPath, photoName, style, resizeMode = 'cover', thumb = false }: Props) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
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
