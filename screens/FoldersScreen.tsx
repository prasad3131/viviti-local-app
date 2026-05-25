import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Modal, TextInput, RefreshControl,
} from 'react-native';
import { getFolders, createFolder } from '../lib/api';

interface Props {
  onBack: () => void;
  onOpenFolder: (path: string) => void;
  onViewPhotos: (path: string) => void;
}

export default function FoldersScreen({ onBack, onOpenFolder, onViewPhotos }: Props) {
  const [pathStack, setPathStack] = useState<string[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const currentPath = pathStack.join('/');

  const load = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const list = await getFolders(path);
      setFolders(list);
      if (list.length === 0 && path === '') setShowCreate(true);
    } catch {
      Alert.alert('Error', 'Cannot reach device. Make sure the server is running.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(''); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(currentPath);
    setRefreshing(false);
  };

  function navigateInto(name: string) {
    const newStack = [...pathStack, name];
    setPathStack(newStack);
    load(newStack.join('/'));
  }

  function navigateBack() {
    if (pathStack.length === 0) { onBack(); return; }
    const newStack = pathStack.slice(0, -1);
    setPathStack(newStack);
    load(newStack.join('/'));
  }

  function navigateToBreadcrumb(index: number) {
    const newStack = pathStack.slice(0, index + 1);
    setPathStack(newStack);
    load(newStack.join('/'));
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const result = await createFolder(currentPath, name);
      if (result.error) {
        Alert.alert(
          'Cannot create album',
          result.error === 'Folder already exists'
            ? `"${name}" already exists. Please choose a different name.`
            : result.error,
        );
      } else {
        setShowCreate(false);
        setNewName('');
        await load(currentPath);
      }
    } catch {
      Alert.alert('Error', 'Failed to create album.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={navigateBack}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Albums</Text>
        <TouchableOpacity onPress={() => { setNewName(''); setShowCreate(true); }}>
          <Text style={styles.addBtn}>+ New</Text>
        </TouchableOpacity>
      </View>

      {pathStack.length > 0 && (
        <View style={styles.breadcrumb}>
          <TouchableOpacity onPress={() => { setPathStack([]); load(''); }}>
            <Text style={styles.crumb}>Home</Text>
          </TouchableOpacity>
          {pathStack.map((segment, i) => (
            <React.Fragment key={i}>
              <Text style={styles.crumbSep}> › </Text>
              <TouchableOpacity onPress={() => navigateToBreadcrumb(i)}>
                <Text style={[styles.crumb, i === pathStack.length - 1 && styles.crumbActive]}>
                  {segment}
                </Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>
      )}

      {!loading && (
        <TouchableOpacity style={styles.viewPhotosBtn} onPress={() => onViewPhotos(currentPath)}>
          <Text style={styles.viewPhotosBtnText}>📷  View photos in this album</Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <ActivityIndicator color="#257af0" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={folders}
          keyExtractor={item => item}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={folders.length === 0 ? styles.emptyContainer : styles.list}
          ListHeaderComponent={folders.length > 0
            ? <Text style={styles.sectionLabel}>Sub-albums</Text>
            : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No sub-albums.</Text>
              <Text style={styles.emptyHint}>Tap "+ New" to create a sub-album here.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.folderRow} onPress={() => navigateInto(item)}>
              <Text style={styles.folderIcon}>📁</Text>
              <Text style={styles.folderName}>{item}</Text>
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={showCreate} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {currentPath ? `New album inside "${pathStack.at(-1)}"` : 'New album'}
            </Text>
            <Text style={styles.modalLabel}>Album name</Text>
            <TextInput
              style={styles.modalInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Vacation, Family"
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => { setShowCreate(false); setNewName(''); }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalCreate} onPress={handleCreate} disabled={creating}>
                {creating
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.modalCreateText}>Create</Text>}
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
    padding: 16, paddingTop: 52, borderBottomWidth: 1, borderBottomColor: '#e0dbe2',
  },
  back: { color: '#257af0', fontSize: 16 },
  title: { fontSize: 18, fontWeight: '700', color: '#1a1118' },
  addBtn: { color: '#257af0', fontSize: 16, fontWeight: '600' },
  breadcrumb: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#f5f3f7', borderBottomWidth: 1, borderBottomColor: '#e0dbe2',
  },
  crumb: { fontSize: 13, color: '#257af0' },
  crumbSep: { fontSize: 13, color: '#c0bcc4' },
  crumbActive: { color: '#1a1118', fontWeight: '600' },
  viewPhotosBtn: {
    flexDirection: 'row', alignItems: 'center',
    margin: 16, marginBottom: 4,
    backgroundColor: '#f0f6ff', borderRadius: 10,
    borderWidth: 1, borderColor: '#c0d8fc', padding: 12,
  },
  viewPhotosBtnText: { color: '#257af0', fontWeight: '600', fontSize: 14 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#9e96a4', marginBottom: 8, letterSpacing: 0.5 },
  list: { padding: 16 },
  emptyContainer: { padding: 32, alignItems: 'center' },
  empty: { alignItems: 'center' },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#1a1118', marginBottom: 6 },
  emptyHint: { fontSize: 13, color: '#6b6070', textAlign: 'center' },
  folderRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#e0dbe2',
    padding: 14, marginBottom: 10,
  },
  folderIcon: { fontSize: 22, marginRight: 12 },
  folderName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1a1118' },
  arrow: { fontSize: 20, color: '#c0bcc4' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 32 },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1a1118', marginBottom: 16 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: '#1a1118', marginBottom: 6 },
  modalInput: {
    borderWidth: 1, borderColor: '#e0dbe2', borderRadius: 10,
    padding: 12, fontSize: 15, marginBottom: 20,
  },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalCancel: {
    flex: 1, borderWidth: 1, borderColor: '#e0dbe2',
    borderRadius: 10, padding: 12, alignItems: 'center',
  },
  modalCancelText: { color: '#6b6070', fontWeight: '600' },
  modalCreate: { flex: 1, backgroundColor: '#257af0', borderRadius: 10, padding: 12, alignItems: 'center' },
  modalCreateText: { color: '#fff', fontWeight: '700' },
});
