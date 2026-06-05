import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Dimensions, Alert, Modal, TextInput,
  RefreshControl, ScrollView, PanResponder, TouchableWithoutFeedback,
  BackHandler,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  getFolders, getPhotos, uploadPhotos, deletePhotos,
  movePhotos, createFolder, deleteFolder, Photo,
  getAiTags, getTaggedPhotos, AiTag, TaggedPhoto,
  triggerFaceBatch, videoUrl,
} from '../lib/api';
import { Linking } from 'react-native';

const TAG_EMOJI: Record<string, string> = {
  beach: '🏖', food: '🍕', pets: '🐶', landscape: '🏔',
  nature: '🌿', sport: '⚽', vehicle: '🚗', birthday: '🎂',
  indoor: '🏠', outdoor: '🌳', people: '👤',
};
import SmartImage from '../components/SmartImage';

const PHOTO_COL = 3;
const PHOTO_SIZE = Dimensions.get('window').width / PHOTO_COL;
const PAGE = 20;

interface Props {
  onBack: () => void;
  onOpenPhoto: (folderPath: string, name: string) => void;
  onOpenVideo?: (folderPath: string, name: string) => void;
  onOpenSearch?: () => void;
  username: string;
  initialScrollOffset?: number;
  onScrollOffsetChange?: (offset: number) => void;
  onPhotoListChange?: (names: string[]) => void;
}

export default function BrowserScreen({ onBack, onOpenPhoto, onOpenVideo, onOpenSearch, username, initialScrollOffset = 0, onScrollOffsetChange, onPhotoListChange }: Props) {
  const [pathStack, setPathStack] = useState<string[]>([username]);
  const [folders, setFolders] = useState<string[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [foldersOnly, setFoldersOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);

  // New folder modal
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creating, setCreating] = useState(false);

  // Tag filter
  const [aiTags, setAiTags] = useState<AiTag[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [taggedPhotos, setTaggedPhotos] = useState<TaggedPhoto[]>([]);
  const [loadingTagPhotos, setLoadingTagPhotos] = useState(false);

  // Copy picker modal
  const [showCopyPicker, setShowCopyPicker] = useState(false);
  const [copyDestStack, setCopyDestStack] = useState<string[]>([]);
  const [copyDestFolders, setCopyDestFolders] = useState<string[]>([]);
  const [copying, setCopying] = useState(false);

  const offset = useRef(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollY = useRef(initialScrollOffset);
  const hasRestoredScroll = useRef(false);
  const currentPath = pathStack.join('/');
  const selecting = selected.size > 0;

  // Swipe-back: ref keeps navigateBack current inside closures
  const navigateBackRef = useRef(navigateBack);
  useEffect(() => { navigateBackRef.current = navigateBack; });

  // Intercept Android hardware back button / system back gesture
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showNewFolder) { setShowNewFolder(false); return true; }
      if (showCopyPicker) { setShowCopyPicker(false); return true; }
      navigateBackRef.current();
      return true;
    });
    return () => sub.remove();
  }, [showNewFolder, showCopyPicker]);

  const swipeEdge = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderRelease: (_evt, gs) => {
        if (gs.dx > 60 && Math.abs(gs.dy) < 100) navigateBackRef.current();
      },
    }),
  ).current;

  // ── Load current folder ────────────────────────────────────────────────────

  const load = useCallback(async (path: string, reset = true) => {
    if (reset) { setLoading(true); setLoadError(false); }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const [folderList, photoResult] = await Promise.all([
          getFolders(path),
          foldersOnly ? Promise.resolve({ photos: [], total: 0 }) : getPhotos(path, 0, PAGE),
        ]);
        setFolders(folderList);
        setPhotos(photoResult.photos);
        setTotal(photoResult.total);
        offset.current = photoResult.photos.length;
        onPhotoListChange?.(photoResult.photos.map(p => p.name));
        setLoadError(false);
        setLoading(false);
        return;
      } catch {
        if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
      }
    }
    setLoadError(true);
    setLoading(false);
  }, [foldersOnly]);

  useEffect(() => { load(currentPath); }, [currentPath, foldersOnly]);

  useEffect(() => {
    setActiveTag(null);
    setAiTags([]);
    getAiTags(currentPath).then(setAiTags).catch(() => {});
  }, [currentPath]);

  const onRefresh = async () => {
    setRefreshing(true);
    setSelected(new Set());
    await load(currentPath);
    setRefreshing(false);
  };

  const onEndReached = async () => {
    if (loadingMore || photos.length >= total || foldersOnly) return;
    setLoadingMore(true);
    try {
      const result = await getPhotos(currentPath, offset.current, PAGE);
      setPhotos(prev => [...prev, ...result.photos]);
      offset.current += result.photos.length;
    } catch {}
    setLoadingMore(false);
  };

  // ── Tag filter ─────────────────────────────────────────────────────────────

  async function handleTagSelect(tag: string | null) {
    setActiveTag(tag);
    if (!tag) return;
    setLoadingTagPhotos(true);
    try {
      const result = await getTaggedPhotos(tag, currentPath);
      setTaggedPhotos(result);
    } catch {}
    setLoadingTagPhotos(false);
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  function navigateInto(name: string) {
    setSelected(new Set());
    setPathStack(prev => [...prev, name]);
  }

  function navigateBack() {
    if (pathStack.length <= 1) { onBack(); return; }
    setSelected(new Set());
    setPathStack(prev => prev.slice(0, -1));
  }

  function navigateToBreadcrumb(index: number) {
    setSelected(new Set());
    setPathStack(prev => prev.slice(0, index + 1));
  }

  // ── Selection ──────────────────────────────────────────────────────────────

  function toggleSelect(name: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  // ── Video open ────────────────────────────────────────────────────────────

  function handleVideoPress(folderPath: string, name: string) {
    if (onOpenVideo) { onOpenVideo(folderPath, name); return; }
    // Fallback (no in-app player wired): open externally
    videoUrl(folderPath, name).then(Linking.openURL).catch(() =>
      Alert.alert('Error', 'Could not open video.'),
    );
  }

  // ── Scan faces for selected photos ────────────────────────────────────────

  async function handleScanFaces() {
    try {
      await triggerFaceBatch();
      setSelected(new Set());
      Alert.alert('Face Scan Started', 'Running face detection in the background. Check the People screen when done.');
    } catch {
      Alert.alert('Error', 'Could not start face scan.');
    }
  }

  // ── Folder delete ──────────────────────────────────────────────────────────

  function handleDeleteFolder(name: string) {
    const folderPath = currentPath ? `${currentPath}/${name}` : name;
    Alert.alert(
      'Delete Folder',
      `Delete "${name}" and everything inside?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await deleteFolder(folderPath);
              load(currentPath);
            } catch { Alert.alert('Error', 'Could not delete folder.'); }
          },
        },
      ],
    );
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async function handleDelete() {
    const names = Array.from(selected);
    Alert.alert('Delete', `Delete ${names.length} photo(s)?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deletePhotos(currentPath, names);
            setSelected(new Set());
            load(currentPath);
          } catch { Alert.alert('Error', 'Delete failed.'); }
        },
      },
    ]);
  }

  // ── Upload ─────────────────────────────────────────────────────────────────

  async function handleUpload() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to upload photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (result.canceled) return;
    setUploading(true);
    try {
      await uploadPhotos(currentPath, result.assets.map(a => ({
        uri: a.uri,
        name: a.fileName || `photo_${Date.now()}.jpg`,
        type: a.mimeType || 'image/jpeg',
      })));
      load(currentPath);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  // ── New folder ─────────────────────────────────────────────────────────────

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const result = await createFolder(currentPath, name);
      if (result.error) {
        Alert.alert('Error', result.error === 'Folder already exists'
          ? `"${name}" already exists.` : result.error);
      } else {
        setShowNewFolder(false);
        setNewFolderName('');
        load(currentPath);
      }
    } catch { Alert.alert('Error', 'Failed to create folder.'); }
    finally { setCreating(false); }
  }

  // ── Copy picker ────────────────────────────────────────────────────────────

  async function openCopyPicker() {
    const list = await getFolders(username).catch(() => []);
    setCopyDestStack([username]);
    setCopyDestFolders(list);
    setShowCopyPicker(true);
  }

  async function copyPickerNavigate(name: string) {
    const newStack = [...copyDestStack, name];
    setCopyDestStack(newStack);
    const list = await getFolders(newStack.join('/')).catch(() => []);
    setCopyDestFolders(list);
  }

  function copyPickerBack() {
    if (copyDestStack.length <= 1) { setShowCopyPicker(false); return; }
    const newStack = copyDestStack.slice(0, -1);
    setCopyDestStack(newStack);
    getFolders(newStack.join('/')).then(setCopyDestFolders).catch(() => {});
  }

  async function confirmCopy() {
    const destPath = copyDestStack.join('/');
    if (destPath === currentPath) {
      Alert.alert('Same folder', 'Choose a different destination folder.');
      return;
    }
    setCopying(true);
    try {
      await movePhotos(currentPath, Array.from(selected), destPath);
      setShowCopyPicker(false);
      setSelected(new Set());
      load(currentPath);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Copy failed.');
    } finally {
      setCopying(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const folderCards = (
    <View style={styles.folderGrid}>
      {folders.map(f => (
        <TouchableOpacity
          key={f}
          style={styles.folderCard}
          onPress={() => navigateInto(f)}
          onLongPress={() => handleDeleteFolder(f)}
        >
          <View style={styles.folderCardInner}>
            <Text style={styles.folderEmoji}>📁</Text>
            <Text style={styles.folderName} numberOfLines={1}>{f}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );

  const listHeader = (
    <>
      {folders.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>FOLDERS</Text>
          {folderCards}
        </>
      )}
      {!foldersOnly && photos.length > 0 && (
        <Text style={styles.sectionLabel}>PHOTOS</Text>
      )}
    </>
  );

  return (
    <View style={styles.container}>
      {/* Invisible left-edge strip to capture swipe-back gesture */}
      {pathStack.length > 1 && (
        <View style={styles.swipeEdge} {...swipeEdge.panHandlers} />
      )}
      {/* ── Header top: back / cancel + search ── */}
      <View style={styles.headerTop}>
        <TouchableOpacity onPress={selecting ? () => setSelected(new Set()) : navigateBack}>
          <Text style={styles.back}>{selecting ? 'Cancel' : '← Back'}</Text>
        </TouchableOpacity>
        {!selecting && onOpenSearch && (
          <TouchableOpacity onPress={onOpenSearch} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.searchIcon}>🔍</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Header actions: pills / selection buttons ── */}
      {selecting ? (
        <View style={styles.selectionActions}>
          <TouchableOpacity style={styles.scanBtn} onPress={handleScanFaces}>
            <Text style={styles.scanBtnText}>👤 Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.moveBtn} onPress={openCopyPicker}>
            <Text style={styles.moveBtnText}>Move ({selected.size})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
            <Text style={styles.deleteBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.pill, foldersOnly && styles.pillActive]}
            onPress={() => setFoldersOnly(f => !f)}
          >
            <Text style={[styles.pillText, foldersOnly && styles.pillActiveText]}>
              📁 Folders
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pill} onPress={() => { setNewFolderName(''); setShowNewFolder(true); }}>
            <Text style={styles.pillText}>+ New</Text>
          </TouchableOpacity>
          {!foldersOnly && (
            <TouchableOpacity style={styles.pill} onPress={handleUpload} disabled={uploading}>
              {uploading
                ? <ActivityIndicator size="small" color="#257af0" />
                : <Text style={styles.pillText}>↑ Upload</Text>}
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Breadcrumb ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.breadcrumbBar}>
        <TouchableOpacity onPress={() => { setSelected(new Set()); setPathStack([username]); }}>
          <Text style={[styles.crumb, pathStack.length === 1 && styles.crumbActive]}>{username}</Text>
        </TouchableOpacity>
        {pathStack.slice(1).map((seg, i) => (
          <React.Fragment key={i}>
            <Text style={styles.crumbSep}> › </Text>
            <TouchableOpacity onPress={() => navigateToBreadcrumb(i + 1)}>
              <Text style={[styles.crumb, i === pathStack.length - 2 && styles.crumbActive]}>
                {seg}
              </Text>
            </TouchableOpacity>
          </React.Fragment>
        ))}
      </ScrollView>

      {/* ── Tag filter bar ── */}
      {!foldersOnly && aiTags.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagBar}
          contentContainerStyle={styles.tagBarContent}>
          <TouchableOpacity
            style={[styles.tagPill, activeTag === null && styles.tagPillActive]}
            onPress={() => handleTagSelect(null)}
          >
            <Text style={[styles.tagPillText, activeTag === null && styles.tagPillActiveText]}>All</Text>
          </TouchableOpacity>
          {aiTags.map(({ tag, count }) => (
            <TouchableOpacity
              key={tag}
              style={[styles.tagPill, activeTag === tag && styles.tagPillActive]}
              onPress={() => handleTagSelect(tag)}
            >
              <Text style={[styles.tagPillText, activeTag === tag && styles.tagPillActiveText]}>
                {TAG_EMOJI[tag] ?? '🏷'} {tag[0].toUpperCase() + tag.slice(1)} · {count}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ── Content ── */}
      {loading ? (
        <ActivityIndicator color="#257af0" style={{ marginTop: 60 }} />
      ) : loadError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>Cannot reach device.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => load(currentPath)}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : activeTag ? (
        loadingTagPhotos ? (
          <ActivityIndicator color="#257af0" style={{ marginTop: 60 }} />
        ) : (
          <FlatList
            data={taggedPhotos}
            keyExtractor={item => item.photo_path}
            numColumns={PHOTO_COL}
            ListEmptyComponent={<Text style={styles.empty}>No {activeTag} photos found here.</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => onOpenPhoto(item.folder, item.name)}
                activeOpacity={0.8}
              >
                <SmartImage folderPath={item.folder} photoName={item.name} style={styles.thumb} thumb />
              </TouchableOpacity>
            )}
          />
        )
      ) : foldersOnly ? (
        <ScrollView
          contentContainerStyle={styles.foldersOnlyContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {folders.length === 0
            ? <Text style={styles.empty}>No folders here. Tap "+ New" to create one.</Text>
            : folderCards}
        </ScrollView>
      ) : (
        <FlatList
          ref={flatListRef}
          data={photos}
          keyExtractor={item => item.name}
          numColumns={PHOTO_COL}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          scrollEventThrottle={16}
          onScroll={e => { scrollY.current = e.nativeEvent.contentOffset.y; }}
          onContentSizeChange={() => {
            if (initialScrollOffset > 0 && !hasRestoredScroll.current) {
              hasRestoredScroll.current = true;
              flatListRef.current?.scrollToOffset({ offset: initialScrollOffset, animated: false });
            }
          }}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            folders.length === 0
              ? <Text style={styles.empty}>No photos or folders here.</Text>
              : null
          }
          ListFooterComponent={loadingMore
            ? <ActivityIndicator color="#257af0" style={{ margin: 16 }} />
            : null}
          renderItem={({ item }) => {
            const isSelected = selected.has(item.name);
            return (
              <TouchableOpacity
                onPress={() => {
                  if (selecting) return toggleSelect(item.name);
                  if (item.isVideo) return handleVideoPress(currentPath, item.name);
                  onScrollOffsetChange?.(scrollY.current);
                  onPhotoListChange?.(photos.map(p => p.name));
                  onOpenPhoto(currentPath, item.name);
                }}
                onLongPress={() => toggleSelect(item.name)}
                activeOpacity={0.8}
              >
                {item.isVideo ? (
                  <View style={[styles.thumb, styles.videoThumb]}>
                    <Text style={styles.videoPlay}>▶</Text>
                    <Text style={styles.videoLabel} numberOfLines={1}>{item.name}</Text>
                  </View>
                ) : (
                  <SmartImage folderPath={currentPath} photoName={item.name} style={styles.thumb} thumb />
                )}
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

      {/* ── New folder modal ── */}
      <Modal visible={showNewFolder} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New folder</Text>
            <TextInput
              style={styles.modalInput}
              value={newFolderName}
              onChangeText={setNewFolderName}
              placeholder="Folder name"
              autoFocus
            />
            <View style={styles.modalRow}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowNewFolder(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleCreateFolder} disabled={creating}>
                {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalConfirmText}>Create</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Copy picker modal ── */}
      <Modal visible={showCopyPicker} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setShowCopyPicker(false)}>
          <View style={styles.pickerOverlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
          <View style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              <TouchableOpacity onPress={copyPickerBack}>
                <Text style={styles.pickerBack}>{copyDestStack.length <= 1 ? 'Cancel' : '← Back'}</Text>
              </TouchableOpacity>
              <Text style={styles.pickerTitle}>Move to...</Text>
              <TouchableOpacity
                style={[styles.moveHereBtn, copying && { opacity: 0.5 }]}
                onPress={confirmCopy}
                disabled={copying}
              >
                {copying
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.moveHereText}>Move here</Text>}
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.pickerBreadcrumb} horizontal showsHorizontalScrollIndicator={false}>
              <Text style={styles.crumb}>Home</Text>
              {copyDestStack.map((seg, i) => (
                <React.Fragment key={i}>
                  <Text style={styles.crumbSep}> › </Text>
                  <Text style={[styles.crumb, i === copyDestStack.length - 1 && styles.crumbActive]}>{seg}</Text>
                </React.Fragment>
              ))}
            </ScrollView>

            <FlatList
              data={copyDestFolders}
              keyExtractor={f => f}
              ListEmptyComponent={<Text style={styles.pickerEmpty}>No sub-folders. Tap "Move here" to copy here.</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.pickerRow} onPress={() => copyPickerNavigate(item)}>
                  <Text style={styles.pickerIcon}>📁</Text>
                  <Text style={styles.pickerFolderName}>{item}</Text>
                  <Text style={styles.pickerArrow}>›</Text>
                </TouchableOpacity>
              )}
            />
          </View>
          </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fefcfe' },
  swipeEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 24, zIndex: 10 },

  // Header
  headerTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 8,
    backgroundColor: '#fefcfe',
  },
  back: { color: '#257af0', fontSize: 15, fontWeight: '500' },
  searchIcon: { fontSize: 18 },
  headerActions: {
    flexDirection: 'row', gap: 6, alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 10,
    backgroundColor: '#fefcfe',
    borderBottomWidth: 1, borderBottomColor: '#e0dbe2',
  },
  selectionActions: {
    flexDirection: 'row', gap: 6, alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 10,
    backgroundColor: '#fefcfe',
    borderBottomWidth: 1, borderBottomColor: '#e0dbe2',
  },
  pill: {
    flex: 1, borderWidth: 1, borderColor: '#c0d8fc', borderRadius: 20,
    paddingVertical: 7, paddingHorizontal: 4, backgroundColor: '#f0f6ff',
  },
  pillActive: { backgroundColor: '#257af0', borderColor: '#257af0' },
  pillText: { fontSize: 13, color: '#257af0', fontWeight: '600', textAlign: 'center' },
  pillActiveText: { color: '#fff' },
  scanBtn: { flex: 1, backgroundColor: '#f5f0ff', borderRadius: 16, paddingVertical: 7, borderWidth: 1, borderColor: '#a855f7' },
  scanBtnText: { color: '#a855f7', fontWeight: '700', fontSize: 13, textAlign: 'center' },
  moveBtn: { flex: 1, backgroundColor: '#257af0', borderRadius: 16, paddingVertical: 7 },
  moveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13, textAlign: 'center' },
  deleteBtn: { flex: 1, backgroundColor: '#fff1f2', borderRadius: 16, paddingVertical: 7, borderWidth: 1, borderColor: '#f43f5e' },
  deleteBtnText: { color: '#f43f5e', fontWeight: '700', fontSize: 13, textAlign: 'center' },

  // Breadcrumb
  breadcrumbBar: {
    backgroundColor: '#f5f3f7', borderBottomWidth: 1, borderBottomColor: '#e0dbe2',
    paddingHorizontal: 16, paddingVertical: 8, flexGrow: 0, flexShrink: 0,
    width: '100%',
  },
  crumb: { fontSize: 13, color: '#257af0' },
  crumbSep: { fontSize: 13, color: '#c0bcc4' },
  crumbActive: { color: '#1a1118', fontWeight: '600' },

  // Sections
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#9e96a4', letterSpacing: 0.8,
    paddingHorizontal: 12, paddingTop: 14, paddingBottom: 6,
  },

  // Folder grid
  folderGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 },
  folderCard: {
    width: '50%', padding: 6,
  },
  folderCardInner: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1,
    borderColor: '#e0dbe2', padding: 14, alignItems: 'center',
  },
  folderEmoji: { fontSize: 28, marginBottom: 6 },
  folderName: { fontSize: 13, fontWeight: '600', color: '#1a1118', textAlign: 'center' },

  // Photo grid
  thumb: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderWidth: 0.5, borderColor: '#fefcfe' },
  videoThumb: { backgroundColor: '#1a1118', justifyContent: 'center', alignItems: 'center' },
  videoPlay:  { fontSize: 28, color: '#fff', opacity: 0.9 },
  videoLabel: { position: 'absolute', bottom: 4, left: 4, right: 4, color: '#ccc', fontSize: 9, textAlign: 'center' },
  checkOverlay: {
    position: 'absolute', top: 0, left: 0, width: PHOTO_SIZE, height: PHOTO_SIZE,
    backgroundColor: 'rgba(37,122,240,0.5)', justifyContent: 'center', alignItems: 'center',
  },
  check: { color: '#fff', fontSize: 28, fontWeight: '800' },

  // Empty
  empty: { textAlign: 'center', color: '#9e96a4', fontSize: 14, marginTop: 60, paddingHorizontal: 32 },
  errorBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorText: { color: '#f43f5e', fontSize: 15, marginBottom: 16 },
  retryBtn: { backgroundColor: '#257af0', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  foldersOnlyContent: { paddingBottom: 40 },

  // New folder modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 32 },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1a1118', marginBottom: 14 },
  modalInput: {
    borderWidth: 1, borderColor: '#e0dbe2', borderRadius: 10,
    padding: 12, fontSize: 15, marginBottom: 20,
  },
  modalRow: { flexDirection: 'row', gap: 10 },
  modalCancel: { flex: 1, borderWidth: 1, borderColor: '#e0dbe2', borderRadius: 10, padding: 12, alignItems: 'center' },
  modalCancelText: { color: '#6b6070', fontWeight: '600' },
  modalConfirm: { flex: 1, backgroundColor: '#257af0', borderRadius: 10, padding: 12, alignItems: 'center' },
  modalConfirmText: { color: '#fff', fontWeight: '700' },

  // Tag filter bar
  tagBar: { backgroundColor: '#fefcfe', borderBottomWidth: 1, borderBottomColor: '#e0dbe2', flexGrow: 0, flexShrink: 0 },
  tagBarContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 6, flexDirection: 'row', alignItems: 'center' },
  tagPill: {
    borderWidth: 1, borderColor: '#c0d8fc', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#f0f6ff',
  },
  tagPillActive: { backgroundColor: '#257af0', borderColor: '#257af0' },
  tagPillText: { fontSize: 12, color: '#257af0', fontWeight: '600' },
  tagPillActiveText: { color: '#fff' },

  // Copy picker modal
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%' },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#e0dbe2',
  },
  pickerBack: { color: '#257af0', fontSize: 15 },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: '#1a1118' },
  moveHereBtn: { backgroundColor: '#257af0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6 },
  moveHereText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  pickerBreadcrumb: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#f5f3f7', flexGrow: 0 },
  pickerEmpty: { color: '#9e96a4', textAlign: 'center', padding: 32, fontSize: 14 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0edf2',
  },
  pickerIcon: { fontSize: 20, marginRight: 12 },
  pickerFolderName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1a1118' },
  pickerArrow: { fontSize: 20, color: '#c0bcc4' },
});
