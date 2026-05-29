import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import { getAlbums, Album, thumbUrl } from '../lib/api';
import SmartImage from '../components/SmartImage';

const COL = 2;
const CARD = (Dimensions.get('window').width - 48) / COL;

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatMonth(key: string) {
  const [y, m] = key.split('-');
  return `${MONTHS[parseInt(m) - 1]} ${y}`;
}

interface Props {
  onBack: () => void;
  onOpenAlbum: (album: Album) => void;
}

export default function AlbumsScreen({ onBack, onOpenAlbum }: Props) {
  const [albums, setAlbums]       = useState<Album[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setAlbums(await getAlbums()); }
    catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const renderAlbum = ({ item }: { item: Album }) => {
    const idx = item.cover.lastIndexOf('/');
    const folder = idx >= 0 ? item.cover.slice(0, idx) : '';
    const name   = idx >= 0 ? item.cover.slice(idx + 1) : item.cover;
    return (
      <TouchableOpacity style={styles.card} onPress={() => onOpenAlbum(item)} activeOpacity={0.85}>
        <SmartImage folderPath={folder} photoName={name} style={styles.cardImg} thumb />
        <View style={styles.cardOverlay}>
          <Text style={styles.cardTitle}>{formatMonth(item.key)}</Text>
          <Text style={styles.cardCount}>{item.count} photo{item.count !== 1 ? 's' : ''}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Albums</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <ActivityIndicator color="#257af0" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={albums}
          keyExtractor={a => a.key}
          numColumns={COL}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📅</Text>
              <Text style={styles.emptyTitle}>No albums yet</Text>
              <Text style={styles.emptyDesc}>Albums are created automatically once you have photos on the device.</Text>
            </View>
          }
          renderItem={renderAlbum}
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
  back:  { color: '#257af0', fontSize: 16, fontWeight: '500', width: 60 },
  title: { fontSize: 17, fontWeight: '700', color: '#1a1118' },

  list: { padding: 16, gap: 12, paddingBottom: 40 },

  card: { width: CARD, borderRadius: 14, overflow: 'hidden', margin: 6 },
  cardImg: { width: CARD, height: CARD },
  cardOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', padding: 10,
  },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cardCount: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },

  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyIcon:  { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1a1118', marginBottom: 8 },
  emptyDesc:  { fontSize: 14, color: '#6b6070', textAlign: 'center', lineHeight: 21 },
});
