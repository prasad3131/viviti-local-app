import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, ActivityIndicator, StatusBar } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { photoUrlSync, videoUrl } from '../lib/api';

interface Props {
  folderPath: string;
  videoName: string;
  onBack: () => void;
}

export default function VideoPlayerScreen({ folderPath, videoName, onBack }: Props) {
  // Video is served from the same /photos/file endpoint as photos (range-enabled),
  // so the sync photo-URL builder gives us the streaming URL immediately.
  const [uri, setUri] = useState<string | null>(() => photoUrlSync(folderPath, videoName));

  useEffect(() => {
    if (uri) return;
    videoUrl(folderPath, videoName).then(setUri).catch(() => {});
  }, [folderPath, videoName, uri]);

  const player = useVideoPlayer(null, p => { p.loop = false; });

  useEffect(() => {
    if (!uri) return;
    try {
      player.replace(uri);
      player.play();
    } catch {}
  }, [uri, player]);

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      {uri ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          nativeControls
          allowsFullscreen
          allowsPictureInPicture
        />
      ) : (
        <ActivityIndicator color="#fff" size="large" />
      )}

      <TouchableOpacity style={styles.closeBtn} onPress={onBack}>
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  closeBtn: {
    position: 'absolute', top: 48, left: 20,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20,
    width: 36, height: 36, justifyContent: 'center', alignItems: 'center',
  },
  closeText: { color: '#fff', fontSize: 16 },
});
