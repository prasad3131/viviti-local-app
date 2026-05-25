import React, { useEffect, useState } from 'react';
import { Image, ImageStyle } from 'react-native';
import { photoUrl } from '../lib/api';

interface Props {
  folderPath: string;
  photoName: string;
  style: ImageStyle | ImageStyle[];
  resizeMode?: 'contain' | 'cover' | 'stretch' | 'center';
}

export default function SmartImage({ folderPath, photoName, style, resizeMode = 'cover' }: Props) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    photoUrl(folderPath, photoName).then(setUri).catch(() => {});
  }, [folderPath, photoName]);

  if (!uri) return null;

  return (
    <Image
      source={{ uri }}
      style={style as any}
      resizeMode={resizeMode}
    />
  );
}
