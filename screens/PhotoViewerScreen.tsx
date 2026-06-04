import React, { useState, useEffect, useRef } from 'react';
import {
  View, TouchableOpacity, Text, StyleSheet,
  Dimensions, StatusBar, Modal, ScrollView, ActivityIndicator,
  Alert, TextInput, Image, BackHandler,
} from 'react-native';
import ZoomableImage from '../components/ZoomableImage';
import {
  critiquePhoto, CritiqueResult, CritiqueIssue,
  detectPhotoFaces, DetectedFace, setFaceName, faceThumbnailUrl,
  getPhotoExif, PhotoExif, getPhotos, deletePhotos, deleteFaceCluster,
  thumbUrl,
} from '../lib/api';
import { Linking } from 'react-native';

const { width, height } = Dimensions.get('screen'); // use 'screen' to cover status bar area too

const SEV_COLOR: Record<string, string> = {
  high: '#f43f5e', medium: '#f97316', low: '#eab308',
};

const MOOD_EMOJI: Record<string, string> = {
  warm: '🌅', cool: '🌊', neutral: '⚖️',
};

function scoreColor(sc: number) {
  if (sc >= 80) return '#22c55e';
  if (sc >= 60) return '#f97316';
  return '#f43f5e';
}

function scoreLabel(sc: number) {
  if (sc >= 85) return 'Outstanding';
  if (sc >= 70) return 'Good';
  if (sc >= 55) return 'Decent';
  if (sc >= 40) return 'Needs Work';
  return 'Poor';
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function IssueRow({ issue }: { issue: CritiqueIssue }) {
  const color = SEV_COLOR[issue.sev] ?? '#9e96a4';
  return (
    <View style={s.issueRow}>
      <View style={[s.sevDot, { backgroundColor: color }]} />
      <Text style={s.issueMsg}>{issue.msg}</Text>
    </View>
  );
}

function GoodRow({ text }: { text: string }) {
  return (
    <View style={s.issueRow}>
      <Text style={s.checkMark}>✓</Text>
      <Text style={s.issueMsg}>{text}</Text>
    </View>
  );
}

function formatBytes(b: number) {
  if (b >= 1e6) return (b / 1e6).toFixed(1) + ' MB';
  return (b / 1e3).toFixed(0) + ' KB';
}

function formatExifDate(d: string) {
  const norm = d.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
  const dt = new Date(norm);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' });
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoIcon}>{icon}</Text>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

type FaceWithUrl = DetectedFace & { thumbUrl: string | null };

export default function PhotoViewerScreen({
  folderPath, photoName, photoList, onBack, onOpenPeople,
}: {
  folderPath: string;
  photoName: string;
  photoList?: string[]; // pre-loaded list from grid — enables instant navigation
  onBack: () => void;
  onOpenPeople?: () => void;
}) {
  const [actionsVisible, setActionsVisible] = useState(false);
  const [critiquing, setCritiquing]         = useState(false);
  const [result, setResult]                 = useState<CritiqueResult | null>(null);
  const [sheetVisible, setSheetVisible]     = useState(false);

  const [faceDetecting, setFaceDetecting]   = useState(false);
  const [detectedFaces, setDetectedFaces]   = useState<FaceWithUrl[]>([]);
  const [faceSheetVisible, setFaceSheetVisible] = useState(false);
  const [renameTarget, setRenameTarget]     = useState<FaceWithUrl | null>(null);
  const [renameText, setRenameText]         = useState('');
  const [renaming, setRenaming]             = useState(false);
  const [anyFaceNamed, setAnyFaceNamed]     = useState(false);

  const [infoLoading, setInfoLoading]       = useState(false);
  const [exif, setExif]                     = useState<PhotoExif | null>(null);
  const [infoVisible, setInfoVisible]       = useState(false);

  // ── Photo navigation ─────────────────────────────────────────────────────────
  const [photos, setPhotos]   = useState<string[]>([]);
  const [curIdx, setCurIdx]   = useState(-1);
  const photosRef             = useRef<string[]>([]);
  const curIdxRef             = useRef(-1);

  const displayName = curIdx >= 0 && photos.length > 0 ? photos[curIdx] : photoName;
  const hasPrev = curIdx > 0;
  const hasNext = curIdx >= 0 && curIdx < photos.length - 1;

  // ── Navigation functions ──────────────────────────────────────────────────
  function navigate(newIdx: number) {
    curIdxRef.current = newIdx;
    setCurIdx(newIdx);
    // Reset all overlay state when changing photo
    setResult(null); setSheetVisible(false);
    setDetectedFaces([]); setFaceSheetVisible(false); setAnyFaceNamed(false);
    setExif(null); setInfoVisible(false);
    setActionsVisible(false); setRenameTarget(null);
  }

  function goNext() {
    const idx = curIdxRef.current;
    const list = photosRef.current;
    if (idx >= 0 && idx < list.length - 1) navigate(idx + 1);
  }

  function goPrev() {
    const idx = curIdxRef.current;
    if (idx > 0) navigate(idx - 1);
  }

  // Prefetch adjacent thumbnails so next/prev loads instantly
  useEffect(() => {
    if (curIdx < 0 || photos.length === 0) return;
    const toPreload = [curIdx + 1, curIdx + 2, curIdx - 1].filter(i => i >= 0 && i < photos.length);
    toPreload.forEach(i => {
      thumbUrl(folderPath, photos[i], 1080)
        .then(url => Image.prefetch(url))
        .catch(() => {});
    });
  }, [curIdx, photos, folderPath]);

  // ── Load photo list (use pre-loaded list if available, else fetch) ────────
  useEffect(() => {
    if (photoList && photoList.length > 0 && photoList.includes(photoName)) {
      const idx = photoList.indexOf(photoName);
      photosRef.current = photoList;
      curIdxRef.current = idx;
      setPhotos(photoList);
      setCurIdx(idx);
      return;
    }
    // Fall back to full API fetch (photo not in pre-loaded list)
    getPhotos(folderPath, 0, 500).then(({ photos: list }) => {
      const names = list.map(p => p.name);
      const idx = names.indexOf(photoName);
      photosRef.current = names;
      curIdxRef.current = idx;
      setPhotos(names);
      setCurIdx(idx);
    }).catch(() => {});
  }, [folderPath, photoName]);

  // ── BackHandler ───────────────────────────────────────────────────────────
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (actionsVisible) { setActionsVisible(false); return true; }
      if (infoVisible)    { setInfoVisible(false);    return true; }
      if (sheetVisible)   { setSheetVisible(false);   return true; }
      if (faceSheetVisible) { setFaceSheetVisible(false); return true; }
      if (renameTarget)   { setRenameTarget(null);    return true; }
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [actionsVisible, infoVisible, sheetVisible, faceSheetVisible, renameTarget, onBack]);

  // ── Actions ───────────────────────────────────────────────────────────────
  async function onCritique() {
    setActionsVisible(false);
    setCritiquing(true);
    try {
      const r = await critiquePhoto(folderPath, displayName);
      if (r.error) throw new Error(r.error);
      setResult(r);
      setSheetVisible(true);
    } catch {
      Alert.alert('Critique unavailable', 'Make sure Python and OpenCV are installed on the device.');
    } finally {
      setCritiquing(false);
    }
  }

  async function onDetectFaces() {
    setActionsVisible(false);
    setFaceDetecting(true);
    try {
      const rawFaces = await detectPhotoFaces(folderPath, displayName);
      const facesWithUrls: FaceWithUrl[] = await Promise.all(
        rawFaces.map(async f => ({
          ...f,
          thumbUrl: f.thumb_filename ? await faceThumbnailUrl(f.thumb_filename) : null,
        }))
      );
      setDetectedFaces(facesWithUrls);
      setFaceSheetVisible(true);
    } catch {
      Alert.alert('Face detection failed', 'Make sure OpenCV is installed on the device.');
    } finally {
      setFaceDetecting(false);
    }
  }

  async function onShowInfo() {
    setActionsVisible(false);
    setInfoLoading(true);
    try {
      const data = await getPhotoExif(folderPath, displayName);
      setExif(data);
      setInfoVisible(true);
    } catch {
      Alert.alert('Info unavailable', 'Could not read photo metadata.');
    } finally {
      setInfoLoading(false);
    }
  }

  async function onDeletePhoto() {
    setActionsVisible(false);
    Alert.alert('Delete Photo', 'This photo will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deletePhotos(folderPath, [displayName]);
            const newList = photosRef.current.filter((_, i) => i !== curIdxRef.current);
            if (newList.length === 0) { onBack(); return; }
            const newIdx = Math.min(curIdxRef.current, newList.length - 1);
            photosRef.current = newList;
            setPhotos(newList);
            navigate(newIdx);
          } catch {
            Alert.alert('Error', 'Could not delete photo.');
          }
        },
      },
    ]);
  }

  async function handleDeleteFace(face: FaceWithUrl) {
    Alert.alert('Remove Face', 'Remove this person from People?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            await deleteFaceCluster(face.cluster_id);
            setDetectedFaces(prev => prev.filter(f => f.cluster_id !== face.cluster_id));
          } catch {
            Alert.alert('Error', 'Could not remove face.');
          }
        },
      },
    ]);
  }

  async function handleSaveName() {
    if (!renameTarget || !renameText.trim()) return;
    setRenaming(true);
    try {
      await setFaceName(renameTarget.cluster_id, renameText.trim(), renameTarget.thumb_filename ?? undefined);
      const saved = renameText.trim();
      setDetectedFaces(prev =>
        prev.map(f => f.cluster_id === renameTarget.cluster_id ? { ...f, cluster_name: saved } : f)
      );
      setAnyFaceNamed(true);
      setRenameTarget(null);
    } catch {
      Alert.alert('Error', 'Could not save name.');
    } finally {
      setRenaming(false);
    }
  }

  const busy = critiquing || faceDetecting || infoLoading;

  return (
    <View style={s.container}>
      <StatusBar hidden />
      <ZoomableImage
        folderPath={folderPath}
        photoName={displayName}
        onSwipeLeft={goNext}
        onSwipeRight={goPrev}
        onSwipeUp={() => setActionsVisible(true)}
      />

      {/* Back button top-left */}
      <TouchableOpacity style={s.closeBtn} onPress={onBack}>
        <Text style={s.closeText}>✕</Text>
      </TouchableOpacity>

      {/* Loading spinner */}
      {busy && (
        <View style={s.busyBadge}>
          <ActivityIndicator color="#fff" size="small" />
        </View>
      )}

      {/* Left / right navigation arrows */}
      {hasPrev && (
        <TouchableOpacity style={s.arrowLeft} onPress={goPrev} activeOpacity={0.7}>
          <Text style={s.arrowText}>‹</Text>
        </TouchableOpacity>
      )}
      {hasNext && (
        <TouchableOpacity style={s.arrowRight} onPress={goNext} activeOpacity={0.7}>
          <Text style={s.arrowText}>›</Text>
        </TouchableOpacity>
      )}

      {/* Bottom handle — tap or swipe up to open actions */}
      <TouchableOpacity style={s.bottomHandle} onPress={() => setActionsVisible(true)} activeOpacity={0.7}>
        <View style={s.handlePill} />
      </TouchableOpacity>

      {/* ── Actions Sheet ── */}
      <Modal visible={actionsVisible} transparent animationType="slide" onRequestClose={() => setActionsVisible(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setActionsVisible(false)} />
        <View style={s.actionsSheet}>
          <View style={s.handle} />
          <TouchableOpacity style={s.actionRow} onPress={onShowInfo}>
            <Text style={s.actionIcon}>ℹ️</Text>
            <Text style={s.actionLabel}>Photo Info</Text>
          </TouchableOpacity>
          <View style={s.actionDivider} />
          <TouchableOpacity style={s.actionRow} onPress={onDetectFaces}>
            <Text style={s.actionIcon}>👤</Text>
            <Text style={s.actionLabel}>People</Text>
          </TouchableOpacity>
          <View style={s.actionDivider} />
          <TouchableOpacity style={s.actionRow} onPress={onCritique}>
            <Text style={s.actionIcon}>⭐</Text>
            <Text style={s.actionLabel}>Critique Photo</Text>
          </TouchableOpacity>
          <View style={s.actionDivider} />
          <TouchableOpacity style={s.actionRow} onPress={onDeletePhoto}>
            <Text style={s.actionIcon}>🗑️</Text>
            <Text style={[s.actionLabel, { color: '#f43f5e' }]}>Delete Photo</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Critique Sheet ── */}
      <Modal visible={sheetVisible} transparent animationType="slide" onRequestClose={() => setSheetVisible(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setSheetVisible(false)} />
        <View style={s.sheet}>
          <View style={s.handle} />
          {result && (
            <>
              <View style={s.scoreRow}>
                <View>
                  <Text style={s.scoreLbl}>Overall Score</Text>
                  <Text style={[s.scoreRating, { color: scoreColor(result.score) }]}>
                    {scoreLabel(result.score)}
                  </Text>
                </View>
                <Text style={[s.scoreNum, { color: scoreColor(result.score) }]}>
                  {result.score}<Text style={s.scoreOf}>/100</Text>
                </Text>
              </View>
              <View style={s.barBg}>
                <View style={[s.barFill, { width: `${result.score}%` as any, backgroundColor: scoreColor(result.score) }]} />
              </View>
              <ScrollView style={s.list} showsVerticalScrollIndicator={false}>
                {(result.mood_desc || result.composition_feel || result.orientation) ? (
                  <Section title={`${MOOD_EMOJI[result.mood ?? ''] ?? '🎨'} Interpretation`}>
                    {result.mood_desc ? <Text style={s.descText}>{result.mood_desc}</Text> : null}
                    {result.composition_feel ? <Text style={s.descText}>{result.composition_feel}</Text> : null}
                    {result.orientation ? (
                      <Text style={s.metaLine}>
                        {result.orientation.charAt(0).toUpperCase() + result.orientation.slice(1)}
                        {result.aspect_ratio ? ` · ${result.aspect_ratio}` : ''}
                      </Text>
                    ) : null}
                  </Section>
                ) : null}
                {(result.technical ?? []).length > 0 && (
                  <Section title="🔧 Technical">
                    {(result.technical ?? []).map((i, idx) => <IssueRow key={idx} issue={i} />)}
                  </Section>
                )}
                {(result.artistic ?? []).length > 0 && (
                  <Section title="🎭 Artistic">
                    {(result.artistic ?? []).map((i, idx) => <IssueRow key={idx} issue={i} />)}
                  </Section>
                )}
                {(result.good_points ?? []).length > 0 && (
                  <Section title="✨ What Works">
                    {(result.good_points ?? []).map((p, idx) => <GoodRow key={idx} text={p} />)}
                  </Section>
                )}
                {(result.improvements ?? []).length > 0 && (
                  <Section title="📈 Points to Improve">
                    {(result.improvements ?? []).map((i, idx) => <IssueRow key={idx} issue={i} />)}
                  </Section>
                )}
                {result.overall ? (
                  <Section title="📷 Overall">
                    <Text style={s.descText}>{result.overall}</Text>
                  </Section>
                ) : null}
              </ScrollView>
            </>
          )}
          <TouchableOpacity style={s.closeSheet} onPress={() => setSheetVisible(false)}>
            <Text style={s.closeSheetTxt}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Face Sheet ── */}
      <Modal visible={faceSheetVisible} transparent animationType="slide" onRequestClose={() => setFaceSheetVisible(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setFaceSheetVisible(false)} />
        <View style={s.sheet}>
          <View style={s.handle} />
          <Text style={s.faceSheetTitle}>
            {detectedFaces.length === 0 ? 'No faces detected' : `${detectedFaces.length} face${detectedFaces.length !== 1 ? 's' : ''} detected`}
          </Text>
          {detectedFaces.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.faceRow}>
              {detectedFaces.map((face, idx) => (
                <View key={idx} style={s.faceCard}>
                  <TouchableOpacity
                    onPress={() => { setRenameTarget(face); setRenameText(face.cluster_name ?? ''); }}
                    activeOpacity={0.8}>
                    {face.thumbUrl
                      ? <Image source={{ uri: face.thumbUrl }} style={s.faceAvatar} />
                      : <View style={[s.faceAvatar, s.faceAvatarEmpty]}><Text style={s.faceAvatarEmptyText}>👤</Text></View>}
                    <Text style={s.faceCardName} numberOfLines={1}>{face.cluster_name ?? 'Unknown'}</Text>
                  </TouchableOpacity>
                  <View style={s.faceCardActions}>
                    <TouchableOpacity onPress={() => { setRenameTarget(face); setRenameText(face.cluster_name ?? ''); }}>
                      <Text style={s.faceCardEdit}>✏️ Rename</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteFace(face)}>
                      <Text style={s.faceCardDelete}>🗑️ Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
          {anyFaceNamed && onOpenPeople ? (
            <TouchableOpacity style={s.viewPeopleBtn} onPress={() => {
              setFaceSheetVisible(false);
              setAnyFaceNamed(false);
              onOpenPeople();
            }}>
              <Text style={s.viewPeopleTxt}>View in People →</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.closeSheet} onPress={() => setFaceSheetVisible(false)}>
              <Text style={s.closeSheetTxt}>Done</Text>
            </TouchableOpacity>
          )}
        </View>
      </Modal>

      {/* ── Info Sheet ── */}
      <Modal visible={infoVisible} transparent animationType="slide" onRequestClose={() => setInfoVisible(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setInfoVisible(false)} />
        <View style={s.sheet}>
          <View style={s.handle} />
          <Text style={s.faceSheetTitle}>Photo Info</Text>
          {exif && !exif.error && (
            <ScrollView style={s.list} showsVerticalScrollIndicator={false}>
              <InfoRow icon="📐" label="Size" value={`${exif.width} × ${exif.height}`} />
              <InfoRow icon="💾" label="File size" value={formatBytes(exif.file_size)} />
              {exif.date_taken && <InfoRow icon="📅" label="Date taken" value={formatExifDate(exif.date_taken)} />}
              {exif.camera_make && <InfoRow icon="📷" label="Camera" value={[exif.camera_make, exif.camera_model].filter(Boolean).join(' ')} />}
              {exif.focal_length != null && <InfoRow icon="🔭" label="Focal length" value={`${exif.focal_length} mm`} />}
              {exif.f_number != null && <InfoRow icon="🔆" label="Aperture" value={`f/${exif.f_number}`} />}
              {exif.iso != null && <InfoRow icon="🎚️" label="ISO" value={String(exif.iso)} />}
              {exif.exposure_time && <InfoRow icon="⏱️" label="Shutter" value={exif.exposure_time} />}
              {exif.gps_lat != null && (
                <TouchableOpacity onPress={() => Linking.openURL(`https://maps.google.com/?q=${exif.gps_lat},${exif.gps_lon}`)}>
                  <InfoRow icon="📍" label="Location" value={`${exif.gps_lat?.toFixed(4)}, ${exif.gps_lon?.toFixed(4)}  →`} />
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
          {exif?.error && <Text style={s.descText}>No EXIF data found in this photo.</Text>}
          <TouchableOpacity style={s.closeSheet} onPress={() => setInfoVisible(false)}>
            <Text style={s.closeSheetTxt}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Rename Modal ── */}
      <Modal visible={!!renameTarget} transparent animationType="fade">
        <View style={s.renameOverlay}>
          <View style={s.renameCard}>
            <Text style={s.renameTitle}>Name this person</Text>
            <TextInput
              style={s.renameInput}
              value={renameText}
              onChangeText={setRenameText}
              placeholder="Enter name..."
              placeholderTextColor="#9e96a4"
              autoFocus
            />
            <View style={s.renameRow}>
              <TouchableOpacity style={s.renameCancel} onPress={() => setRenameTarget(null)}>
                <Text style={s.renameCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.renameSave} onPress={handleSaveName} disabled={renaming}>
                {renaming
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.renameSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  image:     { width, height },

  closeBtn: {
    position: 'absolute', top: 48, left: 20,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20,
    width: 36, height: 36, justifyContent: 'center', alignItems: 'center',
  },
  closeText: { color: '#fff', fontSize: 16 },

  busyBadge: {
    position: 'absolute', top: 48, right: 20,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20,
    width: 36, height: 36, justifyContent: 'center', alignItems: 'center',
  },

  // Navigation arrows
  arrowLeft: {
    position: 'absolute', left: 0, top: '50%', marginTop: -36,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderTopRightRadius: 36, borderBottomRightRadius: 36,
    paddingVertical: 22, paddingLeft: 10, paddingRight: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  arrowRight: {
    position: 'absolute', right: 0, top: '50%', marginTop: -36,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderTopLeftRadius: 36, borderBottomLeftRadius: 36,
    paddingVertical: 22, paddingRight: 10, paddingLeft: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  arrowText: { color: 'rgba(255,255,255,0.92)', fontSize: 38, fontWeight: '200', lineHeight: 42 },

  // Bottom handle pill
  bottomHandle: {
    position: 'absolute', bottom: 24, left: 0, right: 0,
    alignItems: 'center', paddingVertical: 12,
  },
  handlePill: {
    width: 44, height: 5, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },

  // Actions sheet
  actionsSheet: {
    backgroundColor: '#1a1118', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 0, paddingTop: 12, paddingBottom: 36,
  },
  actionRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 24, paddingVertical: 18, gap: 16,
  },
  actionIcon:    { fontSize: 22 },
  actionLabel:   { color: '#e8e0ee', fontSize: 17, fontWeight: '600' },
  actionDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginHorizontal: 24 },

  overlay: { flex: 1 },
  handle: {
    width: 40, height: 4, backgroundColor: '#3d3344', borderRadius: 2,
    alignSelf: 'center', marginBottom: 22,
  },
  sheet: {
    backgroundColor: '#1a1118', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40,
    maxHeight: height * 0.72,
  },

  scoreRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  scoreLbl:    { color: '#9e96a4', fontSize: 14, fontWeight: '600' },
  scoreRating: { fontSize: 18, fontWeight: '700', marginTop: 2 },
  scoreNum:    { fontSize: 40, fontWeight: '800' },
  scoreOf:     { fontSize: 16, fontWeight: '400', color: '#6b6070' },
  barBg:       { height: 6, borderRadius: 3, backgroundColor: '#2a2030', marginBottom: 22, overflow: 'hidden' },
  barFill:     { height: 6, borderRadius: 3 },
  list:        { maxHeight: height * 0.42 },

  section:      { marginBottom: 20 },
  sectionTitle: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginBottom: 10 },
  descText:     { color: '#c0b8cc', fontSize: 14, lineHeight: 21, marginBottom: 6 },
  metaLine:     { color: '#6b6070', fontSize: 12, marginTop: 2 },
  issueRow:     { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  sevDot:       { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  checkMark:    { color: '#22c55e', fontSize: 14, marginTop: 1, width: 16, textAlign: 'center' },
  issueMsg:     { color: '#e8e0ee', fontSize: 14, lineHeight: 21, flex: 1 },

  closeSheet:    { marginTop: 18, backgroundColor: '#2a2030', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  viewPeopleBtn: { marginTop: 18, backgroundColor: '#6428b4', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  viewPeopleTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  closeSheetTxt: { color: '#e8e0ee', fontSize: 16, fontWeight: '600' },

  faceSheetTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  faceRow:        { gap: 16, paddingHorizontal: 4, paddingBottom: 8 },
  faceCard:       { alignItems: 'center', width: 90 },
  faceAvatar:     { width: 80, height: 80, borderRadius: 40, marginBottom: 8 },
  faceAvatarEmpty: { backgroundColor: '#2a2030', justifyContent: 'center', alignItems: 'center' },
  faceAvatarEmptyText: { fontSize: 30 },
  faceCardName:    { color: '#e8e0ee', fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  faceCardActions: { flexDirection: 'row', gap: 8 },
  faceCardEdit:    { color: '#9e96a4', fontSize: 11, textAlign: 'center' },
  faceCardDelete:  { color: '#f43f5e', fontSize: 11, textAlign: 'center' },

  infoRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2a2030' },
  infoIcon:  { fontSize: 16, width: 26 },
  infoLabel: { color: '#9e96a4', fontSize: 13, width: 90 },
  infoValue: { color: '#e8e0ee', fontSize: 13, flex: 1, textAlign: 'right' },

  renameOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 32 },
  renameCard:    { backgroundColor: '#1a1118', borderRadius: 16, padding: 24 },
  renameTitle:   { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 14 },
  renameInput:   { backgroundColor: '#2a2030', borderRadius: 10, padding: 12, fontSize: 15, color: '#e8e0ee', marginBottom: 20 },
  renameRow:     { flexDirection: 'row', gap: 10 },
  renameCancel:  { flex: 1, backgroundColor: '#2a2030', borderRadius: 10, padding: 12, alignItems: 'center' },
  renameCancelText: { color: '#9e96a4', fontWeight: '600' },
  renameSave:    { flex: 1, backgroundColor: '#6428b4', borderRadius: 10, padding: 12, alignItems: 'center' },
  renameSaveText: { color: '#fff', fontWeight: '700' },
});
