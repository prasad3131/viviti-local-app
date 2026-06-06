import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Dimensions, RefreshControl, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getPhotos, uploadPhotos, deletePhotos, Photo } from '../lib/api';
import SmartImage from '../components/SmartImage';

const COL = 3;
const SIZE = Dimensions.get('window').width / COL;
const PAGE = 10;

export default function PhotosScreen({
  folderPath, onBack, onOpenPhoto,
}: {
  folderPath: string;
  onBack: () => void;
  onOpenPhoto: (name: string) => void;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const offset = useRef(0);

  const loadPage = useCallback(async (reset = false) => {
    const off = reset ? 0 : offset.current;
    try {
      const result = await getPhotos(folderPath, off, PAGE);
      setTotal(result.total);
      setPhotos(prev => reset ? result.photos : [...prev, ...result.photos]);
      offset.current = off + result.photos.length;
    } catch {
      Alert.alert('Error', 'Could not load photos.');
    }
  }, [folderPath]);

  useEffect(() => {
    setLoading(true);
    loadPage(true).finally(() => setLoading(false));
  }, [loadPage]);

  const onRefresh = async () => {
    setRefreshing(true);
    setSelected(new Set());
    await loadPage(true);
    setRefreshing(false);
  };

  const onEndReached = async () => {
    if (loadingMore || photos.length >= total) return;
    setLoadingMore(true);
    await loadPage(false);
    setLoadingMore(false);
  };

  function toggleSelect(name: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  async function handleDelete() {
    const names = Array.from(selected);
    Alert.alert('Delete', `Delete ${names.length} photo(s)?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deletePhotos(folderPath, names);
            setSelected(new Set());
            await loadPage(true);
          } catch {
            Alert.alert('Error', 'Delete failed.');
          }
        },
      },
    ]);
  }

  async function handleUpload() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to upload photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (result.canceled) return;

    setUploading(true);
    try {
      const VIDEO_EXT = /\.(mp4|mov|m4v|3gp|avi|mkv|webm)$/i;
      const assets = result.assets.map(a => {
        const isVideo = a.type === 'video'
          || /^video\//i.test(a.mimeType || '')
          || VIDEO_EXT.test(a.fileName || a.uri || '');
        const srcExt = (a.fileName || a.uri || '').split('.').pop()?.toLowerCase() || '';
        const ext = isVideo
          ? (VIDEO_EXT.test('.' + srcExt) ? srcExt : (a.mimeType?.split('/')[1] || 'mp4'))
          : 'jpg';
        return {
          uri: a.uri,
          name: a.fileName || `${isVideo ? 'video' : 'photo'}_${Date.now()}.${ext}`,
          type: a.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
        };
      });
      await uploadPhotos(folderPath, assets);
      await loadPage(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  const selecting = selected.size > 0;
  const albumLabel = folderPath.split('/').pop() || 'Photos';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={selecting ? () => setSelected(new Set()) : onBack}>
          <Text style={styles.back}>{selecting ? 'Cancel' : '← Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{albumLabel}</Text>
        {selecting ? (
          <TouchableOpacity onPress={handleDelete}>
            <Text style={styles.deleteBtn}>Delete ({selected.size})</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={handleUpload} disabled={uploading}>
            {uploading
              ? <ActivityIndicator color="#257af0" />
              : <Text style={styles.uploadBtn}>↑ Upload</Text>}
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color="#257af0" style={{ marginTop: 60 }} />
      ) : photos.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No photos yet.</Text>
          <Text style={styles.emptyHint}>Tap "↑ Upload" to add photos from your gallery.</Text>
        </View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={item => item.name}
          numColumns={COL}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore
            ? <ActivityIndicator color="#257af0" style={{ margin: 16 }} />
            : null}
          renderItem={({ item }) => {
            const isSelected = selected.has(item.name);
            return (
              <TouchableOpacity
                onPress={() => selecting ? toggleSelect(item.name) : onOpenPhoto(item.name)}
                onLongPress={() => toggleSelect(item.name)}
                activeOpacity={0.8}
              >
                <SmartImage
                  folderPath={folderPath}
                  photoName={item.name}
                  style={styles.thumb}
                  thumb
                />
                {isSelected && (
                  <View style={styles.checkOverlay}>
                    <Text style={styles.check}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, paddingTop: 52, backgroundColor: '#111',
  },
  back: { color: '#257af0', fontSize: 15 },
  title: { flex: 1, color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center', marginHorizontal: 8 },
  uploadBtn: { color: '#257af0', fontSize: 15, fontWeight: '600' },
  deleteBtn: { color: '#f43f5e', fontSize: 15, fontWeight: '600' },
  thumb: { width: SIZE, height: SIZE, borderWidth: 0.5, borderColor: '#000' },
  checkOverlay: {
    position: 'absolute', top: 0, left: 0, width: SIZE, height: SIZE,
    backgroundColor: 'rgba(37,122,240,0.5)', justifyContent: 'center', alignItems: 'center',
  },
  check: { color: '#fff', fontSize: 32, fontWeight: '700' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptyHint: { color: '#6b6070', fontSize: 13, textAlign: 'center' },
});
