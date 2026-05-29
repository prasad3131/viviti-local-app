import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Dimensions,
} from 'react-native';
import { getAlbumPhotos, Album, AlbumPhoto } from '../lib/api';
import SmartImage from '../components/SmartImage';

const COL = 3;
const PHOTO_SIZE = Dimensions.get('window').width / COL;

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatMonth(key: string) {
  const [y, m] = key.split('-');
  return `${MONTHS[parseInt(m) - 1]} ${y}`;
}

interface Props {
  album: Album;
  onBack: () => void;
  onOpenPhoto: (folder: string, name: string) => void;
}

export default function AlbumPhotosScreen({ album, onBack, onOpenPhoto }: Props) {
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAlbumPhotos(album.key)
      .then(setPhotos)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [album.key]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>{formatMonth(album.key)}</Text>
          <Text style={styles.subtitle}>{photos.length} photo{photos.length !== 1 ? 's' : ''}</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <ActivityIndicator color="#257af0" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={photos}
          keyExtractor={p => p.photo_path}
          numColumns={COL}
          ListEmptyComponent={<Text style={styles.empty}>No photos found for this month.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => onOpenPhoto(item.folder, item.name)} activeOpacity={0.8}>
              <SmartImage folderPath={item.folder} photoName={item.name} style={styles.thumb} thumb />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fefcfe' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#e0dbe2', backgroundColor: '#fefcfe',
  },
  back:         { color: '#257af0', fontSize: 16, fontWeight: '500', width: 60 },
  headerCenter: { alignItems: 'center' },
  title:        { fontSize: 17, fontWeight: '700', color: '#1a1118' },
  subtitle:     { fontSize: 12, color: '#9e96a4', marginTop: 2 },

  thumb: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderWidth: 0.5, borderColor: '#fefcfe' },
  empty: { textAlign: 'center', color: '#9e96a4', fontSize: 14, marginTop: 60 },
});
