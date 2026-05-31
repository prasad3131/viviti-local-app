import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, TextInput, Modal, Image,
  RefreshControl, Dimensions,
} from 'react-native';
import { getFaces, setFaceName, triggerFaceBatch, faceThumbnailUrl, deleteFaceCluster, FaceCluster } from '../lib/api';

const COL = 3;
const CELL = Dimensions.get('window').width / COL;

interface Props {
  onBack: () => void;
  onOpenFace: (face: FaceCluster) => void;
}

export default function FacesScreen({ onBack, onOpenFace }: Props) {
  const [faces, setFaces]           = useState<FaceCluster[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [thumbUris, setThumbUris]   = useState<Record<number, string>>({});

  // Select mode
  const [selecting, setSelecting]   = useState(false);
  const [selected, setSelected]     = useState<Set<number>>(new Set());
  const [deleting, setDeleting]     = useState(false);

  // Rename modal
  const [editing, setEditing]       = useState<FaceCluster | null>(null);
  const [nameInput, setNameInput]   = useState('');
  const [saving, setSaving]         = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getFaces();
      setFaces(data);
      const uris: Record<number, string> = {};
      await Promise.all(data.map(async f => {
        if (f.sample_thumb) {
          const filename = f.sample_thumb.split('/').pop() ?? '';
          if (filename) uris[f.id] = await faceThumbnailUrl(filename);
        }
      }));
      setThumbUris(uris);
    } catch {
      Alert.alert('Error', 'Cannot load faces from device.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  function exitSelectMode() {
    setSelecting(false);
    setSelected(new Set());
  }

  function toggleSelect(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function enterSelectMode(id: number) {
    setSelecting(true);
    setSelected(new Set([id]));
  }

  async function handleDelete() {
    if (selected.size === 0) return;
    Alert.alert(
      'Delete people',
      `Remove ${selected.size} person${selected.size > 1 ? 's' : ''} from the People list? Photos are not deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await Promise.all([...selected].map(id => deleteFaceCluster(id)));
              setFaces(prev => prev.filter(f => !selected.has(f.id)));
              exitSelectMode();
            } catch {
              Alert.alert('Error', 'Could not delete selected people.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  async function handleRunBatch() {
    try {
      await triggerFaceBatch();
      Alert.alert('Face scan started', 'Running in background — refresh in a minute.');
    } catch {
      Alert.alert('Error', 'Could not start face scan.');
    }
  }

  function openRename(face: FaceCluster) {
    setEditing(face);
    setNameInput(face.name ?? '');
  }

  function handleLongPress(face: FaceCluster) {
    if (selecting) { toggleSelect(face.id); return; }
    Alert.alert(face.name ?? 'Unknown', undefined, [
      { text: 'Select', onPress: () => enterSelectMode(face.id) },
      { text: 'Rename', onPress: () => openRename(face) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handleSaveName() {
    if (!editing || !nameInput.trim()) return;
    setSaving(true);
    try {
      await setFaceName(editing.id, nameInput.trim());
      setFaces(prev => prev.map(f => f.id === editing.id ? { ...f, name: nameInput.trim() } : f));
      setEditing(null);
    } catch {
      Alert.alert('Error', 'Could not save name.');
    } finally {
      setSaving(false);
    }
  }

  const renderFace = ({ item }: { item: FaceCluster }) => {
    const uri = thumbUris[item.id];
    const isSelected = selected.has(item.id);
    return (
      <TouchableOpacity
        style={styles.cell}
        onPress={() => selecting ? toggleSelect(item.id) : onOpenFace(item)}
        onLongPress={() => handleLongPress(item)}
        activeOpacity={0.8}
      >
        <View style={[styles.avatar, isSelected && styles.avatarSelected]}>
          {uri
            ? <Image source={{ uri }} style={styles.avatarImg} />
            : <Text style={styles.avatarPlaceholder}>👤</Text>}
          {isSelected && (
            <View style={styles.checkOverlay}>
              <Text style={styles.checkMark}>✓</Text>
            </View>
          )}
        </View>
        <Text style={styles.faceName} numberOfLines={1}>
          {item.name ?? 'Unknown'}
        </Text>
        <Text style={styles.faceCount}>{item.photo_count} photo{item.photo_count !== 1 ? 's' : ''}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {selecting ? (
          <>
            <TouchableOpacity onPress={exitSelectMode}>
              <Text style={styles.back}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.title}>
              {selected.size > 0 ? `${selected.size} selected` : 'Select'}
            </Text>
            <TouchableOpacity
              style={[styles.deleteBtn, selected.size === 0 && styles.deleteBtnDisabled]}
              onPress={handleDelete}
              disabled={selected.size === 0 || deleting}
            >
              {deleting
                ? <ActivityIndicator color="#e53935" size="small" />
                : <Text style={[styles.deleteTxt, selected.size === 0 && styles.deleteTxtDisabled]}>Delete</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity onPress={onBack}>
              <Text style={styles.back}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>People</Text>
            <TouchableOpacity style={styles.scanBtn} onPress={handleRunBatch}>
              <Text style={styles.scanTxt}>Scan</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color="#257af0" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={faces}
          keyExtractor={f => String(f.id)}
          numColumns={COL}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>👤</Text>
              <Text style={styles.emptyTitle}>No faces found yet</Text>
              <Text style={styles.emptyDesc}>Tap "Scan" to detect faces in your photos. Long-press a face to select or rename.</Text>
            </View>
          }
          renderItem={renderFace}
        />
      )}

      {/* Rename modal — only when not in select mode */}
      <Modal visible={!!editing && !selecting} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Name this person</Text>
            <TextInput
              style={styles.modalInput}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="e.g. Mum, Dad, Alex..."
              autoFocus
            />
            <View style={styles.modalRow}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setEditing(null)}>
                <Text style={styles.modalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleSaveName} disabled={saving}>
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.modalConfirmTxt}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  back:  { color: '#257af0', fontSize: 16, fontWeight: '500' },
  title: { fontSize: 17, fontWeight: '700', color: '#1a1118' },
  scanBtn: { backgroundColor: '#f0f6ff', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: '#c0d8fc' },
  scanTxt: { color: '#257af0', fontSize: 13, fontWeight: '700' },
  deleteBtn: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6 },
  deleteBtnDisabled: { opacity: 0.35 },
  deleteTxt: { color: '#e53935', fontSize: 13, fontWeight: '700' },
  deleteTxtDisabled: { color: '#e53935' },

  list: { padding: 8, paddingBottom: 40 },

  cell:   { width: CELL, padding: 8, alignItems: 'center' },
  avatar: {
    width: CELL - 24, height: CELL - 24, borderRadius: (CELL - 24) / 2,
    backgroundColor: '#f0edf2', overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center', marginBottom: 6,
  },
  avatarSelected: { borderWidth: 3, borderColor: '#257af0' },
  avatarImg:         { width: '100%', height: '100%' },
  avatarPlaceholder: { fontSize: 36 },
  checkOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#257af0', justifyContent: 'center', alignItems: 'center',
  },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  faceName: { fontSize: 13, fontWeight: '600', color: '#1a1118', textAlign: 'center' },
  faceCount: { fontSize: 11, color: '#9e96a4', marginTop: 2 },

  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyIcon:  { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1a1118', marginBottom: 8 },
  emptyDesc:  { fontSize: 14, color: '#6b6070', textAlign: 'center', lineHeight: 21 },

  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 32 },
  modalCard:     { backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  modalTitle:    { fontSize: 16, fontWeight: '700', color: '#1a1118', marginBottom: 14 },
  modalInput:    { borderWidth: 1, borderColor: '#e0dbe2', borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 20 },
  modalRow:      { flexDirection: 'row', gap: 10 },
  modalCancel:   { flex: 1, borderWidth: 1, borderColor: '#e0dbe2', borderRadius: 10, padding: 12, alignItems: 'center' },
  modalCancelTxt:  { color: '#6b6070', fontWeight: '600' },
  modalConfirm:    { flex: 1, backgroundColor: '#257af0', borderRadius: 10, padding: 12, alignItems: 'center' },
  modalConfirmTxt: { color: '#fff', fontWeight: '700' },
});
