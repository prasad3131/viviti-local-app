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
  // If a thumbnail fails to load (e.g. a bad/empty server thumb), fall back to
  // the original photo once so the image never stays blank.
  const [fellBack, setFellBack] = useState(false);

  useEffect(() => {
    setFellBack(false);
    // Always re-derive the URL when photo changes — sync first, async fallback
    const syncUri = thumb
      ? thumbUrlSync(folderPath, photoName, size)
      : photoUrlSync(folderPath, photoName);
    if (syncUri) { setUri(syncUri); return; }
    const fn = thumb ? thumbUrl(folderPath, photoName, size) : photoUrl(folderPath, photoName);
    fn.then(setUri).catch(() => {});
  }, [folderPath, photoName, thumb, size]);

  function handleError() {
    if (fellBack || !thumb) return;        // only a thumb can fall back, and only once
    setFellBack(true);
    const syncP = photoUrlSync(folderPath, photoName);
    if (syncP) { setUri(syncP); return; }
    photoUrl(folderPath, photoName).then(setUri).catch(() => {});
  }

  if (!uri) return null;

  return (
    <Image
      source={{ uri, cache: fellBack ? 'reload' : size > 400 ? 'default' : 'force-cache' }}
      style={style as any}
      resizeMode={resizeMode}
      onError={handleError}
    />
  );
}
