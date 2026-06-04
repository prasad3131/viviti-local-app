import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Dimensions, TextInput, ScrollView, Keyboard,
} from 'react-native';
import { searchPhotos, getObjectLabels, SearchPhoto } from '../lib/api';
import SmartImage from '../components/SmartImage';

const COL = 3;
const PHOTO_SIZE = Dimensions.get('window').width / COL;

// Friendly starting points — map to the synonym expansion on the device.
const SUGGESTIONS = ['dog', 'cat', 'bird', 'food', 'beach', 'car', 'flower', 'baby', 'mountain', 'water'];

interface Props {
  onBack: () => void;
  onOpenPhoto: (folder: string, name: string) => void;
}

export default function SearchScreen({ onBack, onOpenPhoto }: Props) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<SearchPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [labels, setLabels]   = useState<string[]>([]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the most common detected labels once, as extra suggestion chips.
  useEffect(() => {
    getObjectLabels()
      .then(objs => setLabels(objs.slice(0, 12).map(o => o.label)))
      .catch(() => {});
  }, []);

  const run = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setSearched(false); return; }
    setLoading(true);
    try { setResults(await searchPhotos(q)); }
    catch { setResults([]); }
    finally { setLoading(false); setSearched(true); }
  }, []);

  // Debounced live search as the user types
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => run(query), 350);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query, run]);

  function pick(term: string) {
    setQuery(term);
    Keyboard.dismiss();
    run(term);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🔍 Search</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search photos — dog, food, beach…"
          placeholderTextColor="#9e96a4"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={() => run(query)}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setSearched(false); }}>
            <Text style={styles.clear}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Suggestion chips — shown until the user has results */}
      {!searched && (
        <ScrollView style={styles.chipsWrap} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
          <Text style={styles.chipsLabel}>Try searching for</Text>
          <View style={styles.chipRow}>
            {SUGGESTIONS.map(s => (
              <TouchableOpacity key={s} style={styles.chip} onPress={() => pick(s)}>
                <Text style={styles.chipText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {labels.length > 0 && (
            <>
              <Text style={styles.chipsLabel}>In your photos</Text>
              <View style={styles.chipRow}>
                {labels.map(l => (
                  <TouchableOpacity key={l} style={[styles.chip, styles.chipAlt]} onPress={() => pick(l)}>
                    <Text style={styles.chipText}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
          <Text style={styles.privacyNote}>🔒 Search runs entirely on your device. No photo ever leaves it.</Text>
        </ScrollView>
      )}

      {searched && (
        loading ? (
          <ActivityIndicator color="#257af0" style={{ marginTop: 60 }} />
        ) : (
          <FlatList
            data={results}
            keyExtractor={p => p.photo_path}
            numColumns={COL}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              results.length > 0
                ? <Text style={styles.count}>{results.length} result{results.length !== 1 ? 's' : ''} for "{query.trim()}"</Text>
                : null
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.emptyTitle}>No matches</Text>
                <Text style={styles.emptyDesc}>
                  Nothing tagged "{query.trim()}". Try a broader word, or run the AI scan so more photos get labeled.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => onOpenPhoto(item.folder, item.name)} activeOpacity={0.8}>
                <SmartImage folderPath={item.folder} photoName={item.name} style={styles.thumb} thumb />
              </TouchableOpacity>
            )}
          />
        )
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

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginVertical: 12, paddingHorizontal: 14,
    backgroundColor: '#f0edf2', borderRadius: 12, height: 46,
  },
  searchIcon: { fontSize: 15 },
  input: { flex: 1, fontSize: 16, color: '#1a1118' },
  clear: { color: '#9e96a4', fontSize: 16, paddingHorizontal: 4 },

  chipsWrap: { flex: 1 },
  chips: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },
  chipsLabel: { fontSize: 12, fontWeight: '700', color: '#9e96a4', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#eaf2ff', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 9 },
  chipAlt: { backgroundColor: '#f0edf2' },
  chipText: { color: '#257af0', fontSize: 14, fontWeight: '600' },

  privacyNote: { fontSize: 12, color: '#9e96a4', textAlign: 'center', marginTop: 32, lineHeight: 18 },

  count: { fontSize: 12, color: '#9e96a4', paddingHorizontal: 16, paddingVertical: 10 },
  thumb: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderWidth: 0.5, borderColor: '#fefcfe' },

  empty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 40 },
  emptyIcon:  { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1a1118', marginBottom: 8 },
  emptyDesc:  { fontSize: 14, color: '#6b6070', textAlign: 'center', lineHeight: 21 },
});
