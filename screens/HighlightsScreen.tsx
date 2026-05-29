import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import { getHighlights, Highlight } from '../lib/api';
import SmartImage from '../components/SmartImage';

const COL = 3;
const PHOTO_SIZE = Dimensions.get('window').width / COL;

interface Props {
  onBack: () => void;
  onOpenPhoto: (folder: string, name: string) => void;
}

export default function HighlightsScreen({ onBack, onOpenPhoto }: Props) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setHighlights(await getHighlights()); }
    catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>✨ Highlights</Text>
        <View style={{ width: 60 }} />
      </View>

      <Text style={styles.subtitle}>Best shot from each burst — sharpest, no duplicates</Text>

      {loading ? (
        <ActivityIndicator color="#257af0" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={highlights}
          keyExtractor={h => h.photo_path}
          numColumns={COL}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>✨</Text>
              <Text style={styles.emptyTitle}>No highlights yet</Text>
              <Text style={styles.emptyDesc}>Run the AI batch scan first so photos get quality scores. Pull to refresh after scanning.</Text>
            </View>
          }
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
  back:  { color: '#257af0', fontSize: 16, fontWeight: '500', width: 60 },
  title: { fontSize: 17, fontWeight: '700', color: '#1a1118' },

  subtitle: { fontSize: 12, color: '#9e96a4', textAlign: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0edf2' },

  thumb: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderWidth: 0.5, borderColor: '#fefcfe' },

  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyIcon:  { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1a1118', marginBottom: 8 },
  emptyDesc:  { fontSize: 14, color: '#6b6070', textAlign: 'center', lineHeight: 21 },
});
