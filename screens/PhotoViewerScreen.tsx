import React, { useState } from 'react';
import {
  View, TouchableOpacity, Text, StyleSheet,
  Dimensions, StatusBar, Modal, ScrollView, ActivityIndicator,
  Alert, TextInput, Image,
} from 'react-native';
import SmartImage from '../components/SmartImage';
import {
  critiquePhoto, CritiqueResult, CritiqueIssue,
  detectPhotoFaces, DetectedFace, setFaceName, faceThumbnailUrl,
} from '../lib/api';

const { width, height } = Dimensions.get('window');

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

type FaceWithUrl = DetectedFace & { thumbUrl: string | null };

export default function PhotoViewerScreen({
  folderPath, photoName, onBack,
}: {
  folderPath: string;
  photoName: string;
  onBack: () => void;
}) {
  const [menuVisible, setMenuVisible]     = useState(false);
  const [critiquing, setCritiquing]       = useState(false);
  const [result, setResult]               = useState<CritiqueResult | null>(null);
  const [sheetVisible, setSheetVisible]   = useState(false);

  const [faceDetecting, setFaceDetecting] = useState(false);
  const [detectedFaces, setDetectedFaces] = useState<FaceWithUrl[]>([]);
  const [faceSheetVisible, setFaceSheetVisible] = useState(false);
  const [renameTarget, setRenameTarget]   = useState<FaceWithUrl | null>(null);
  const [renameText, setRenameText]       = useState('');
  const [renaming, setRenaming]           = useState(false);

  async function onCritique() {
    setMenuVisible(false);
    setCritiquing(true);
    try {
      const r = await critiquePhoto(folderPath, photoName);
      if (r.error) throw new Error(r.error);
      setResult(r);
      setSheetVisible(true);
    } catch {
      Alert.alert(
        'Critique unavailable',
        'Make sure Python and OpenCV are installed on the device.',
      );
    } finally {
      setCritiquing(false);
    }
  }

  async function onDetectFaces() {
    setMenuVisible(false);
    setFaceDetecting(true);
    try {
      const rawFaces = await detectPhotoFaces(folderPath, photoName);
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

  async function handleSaveName() {
    if (!renameTarget || !renameText.trim()) return;
    setRenaming(true);
    try {
      await setFaceName(renameTarget.cluster_id, renameText.trim());
      const saved = renameText.trim();
      setDetectedFaces(prev =>
        prev.map(f => f.cluster_id === renameTarget.cluster_id ? { ...f, cluster_name: saved } : f)
      );
      setRenameTarget(null);
    } catch {
      Alert.alert('Error', 'Could not save name.');
    } finally {
      setRenaming(false);
    }
  }

  const busy = critiquing || faceDetecting;

  return (
    <View style={s.container}>
      <StatusBar hidden />
      <SmartImage
        folderPath={folderPath}
        photoName={photoName}
        style={s.image}
        resizeMode="contain"
      />

      <TouchableOpacity style={s.closeBtn} onPress={onBack}>
        <Text style={s.closeText}>✕</Text>
      </TouchableOpacity>

      {/* Three-dots menu button */}
      <TouchableOpacity style={s.menuBtn} onPress={() => setMenuVisible(v => !v)} disabled={busy}>
        {busy
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={s.menuDots}>⋮</Text>}
      </TouchableOpacity>

      {/* Tap-away backdrop to close menu */}
      {menuVisible && (
        <TouchableOpacity style={s.menuBackdrop} activeOpacity={1} onPress={() => setMenuVisible(false)} />
      )}

      {/* Dropdown menu */}
      {menuVisible && (
        <View style={s.dropdown}>
          <TouchableOpacity style={s.dropdownItem} onPress={onDetectFaces}>
            <Text style={s.dropdownIcon}>👤</Text>
            <Text style={s.dropdownLabel}>Face Detection</Text>
          </TouchableOpacity>
          <View style={s.dropdownDivider} />
          <TouchableOpacity style={s.dropdownItem} onPress={onCritique}>
            <Text style={s.dropdownIcon}>⭐</Text>
            <Text style={s.dropdownLabel}>Critique</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Critique Sheet ── */}
      <Modal
        visible={sheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetVisible(false)}
      >
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
                  {result.score}
                  <Text style={s.scoreOf}>/100</Text>
                </Text>
              </View>
              <View style={s.barBg}>
                <View style={[s.barFill, {
                  width: `${result.score}%` as any,
                  backgroundColor: scoreColor(result.score),
                }]} />
              </View>

              <ScrollView style={s.list} showsVerticalScrollIndicator={false}>

                {/* 1. Interpretation — always show if any field present */}
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

                {/* 2. Technical */}
                {(result.technical ?? []).length > 0 && (
                  <Section title="🔧 Technical">
                    {(result.technical ?? []).map((i, idx) => <IssueRow key={idx} issue={i} />)}
                  </Section>
                )}

                {/* 3. Artistic */}
                {(result.artistic ?? []).length > 0 && (
                  <Section title="🎭 Artistic">
                    {(result.artistic ?? []).map((i, idx) => <IssueRow key={idx} issue={i} />)}
                  </Section>
                )}

                {/* 4. What Works */}
                {(result.good_points ?? []).length > 0 && (
                  <Section title="✨ What Works">
                    {(result.good_points ?? []).map((p, idx) => <GoodRow key={idx} text={p} />)}
                  </Section>
                )}

                {/* 5. Points to Improve */}
                {(result.improvements ?? []).length > 0 && (
                  <Section title="📈 Points to Improve">
                    {(result.improvements ?? []).map((i, idx) => <IssueRow key={idx} issue={i} />)}
                  </Section>
                )}

                {/* 6. Overall */}
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
      <Modal
        visible={faceSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFaceSheetVisible(false)}
      >
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setFaceSheetVisible(false)} />
        <View style={s.sheet}>
          <View style={s.handle} />
          <Text style={s.faceSheetTitle}>
            {detectedFaces.length === 0
              ? 'No faces detected'
              : `${detectedFaces.length} face${detectedFaces.length !== 1 ? 's' : ''} detected`}
          </Text>
          {detectedFaces.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.faceRow}>
              {detectedFaces.map((face, idx) => (
                <TouchableOpacity key={idx} style={s.faceCard}
                  onPress={() => { setRenameTarget(face); setRenameText(face.cluster_name ?? ''); }}>
                  {face.thumbUrl ? (
                    <Image source={{ uri: face.thumbUrl }} style={s.faceAvatar} />
                  ) : (
                    <View style={[s.faceAvatar, s.faceAvatarEmpty]}>
                      <Text style={s.faceAvatarEmptyText}>👤</Text>
                    </View>
                  )}
                  <Text style={s.faceCardName} numberOfLines={1}>
                    {face.cluster_name ?? 'Unknown'}
                  </Text>
                  <Text style={s.faceCardEdit}>✏️ Rename</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <TouchableOpacity style={s.closeSheet} onPress={() => setFaceSheetVisible(false)}>
            <Text style={s.closeSheetTxt}>Done</Text>
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
  container:    { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  image:        { width, height },

  closeBtn: {
    position: 'absolute', top: 48, right: 20,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20,
    width: 36, height: 36, justifyContent: 'center', alignItems: 'center',
  },
  closeText: { color: '#fff', fontSize: 16 },

  menuBtn: {
    position: 'absolute', top: 48, left: 20,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20,
    width: 36, height: 36, justifyContent: 'center', alignItems: 'center',
  },
  menuDots: { color: '#fff', fontSize: 20, lineHeight: 22, fontWeight: '700' },

  menuBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  dropdown: {
    position: 'absolute', top: 92, left: 20,
    backgroundColor: 'rgba(20,14,26,0.96)', borderRadius: 14,
    overflow: 'hidden', minWidth: 190,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12, elevation: 10,
  },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  dropdownIcon:    { fontSize: 18 },
  dropdownLabel:   { color: '#e8e0ee', fontSize: 15, fontWeight: '600' },
  dropdownDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: 12 },

  overlay: { flex: 1 },
  sheet: {
    backgroundColor: '#1a1118', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40,
    maxHeight: height * 0.72,
  },
  handle: {
    width: 40, height: 4, backgroundColor: '#3d3344', borderRadius: 2,
    alignSelf: 'center', marginBottom: 22,
  },

  // Critique score
  scoreRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  scoreLbl:    { color: '#9e96a4', fontSize: 14, fontWeight: '600' },
  scoreRating: { fontSize: 18, fontWeight: '700', marginTop: 2 },
  scoreNum:    { fontSize: 40, fontWeight: '800' },
  scoreOf:     { fontSize: 16, fontWeight: '400', color: '#6b6070' },
  barBg:       { height: 6, borderRadius: 3, backgroundColor: '#2a2030', marginBottom: 22, overflow: 'hidden' },
  barFill:     { height: 6, borderRadius: 3 },
  list:        { flex: 1 },

  section:      { marginBottom: 20 },
  sectionTitle: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginBottom: 10 },
  descText:     { color: '#c0b8cc', fontSize: 14, lineHeight: 21, marginBottom: 6 },
  metaLine:     { color: '#6b6070', fontSize: 12, marginTop: 2 },
  issueRow:     { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  sevDot:       { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  checkMark:    { color: '#22c55e', fontSize: 14, marginTop: 1, width: 16, textAlign: 'center' },
  issueMsg:     { color: '#e8e0ee', fontSize: 14, lineHeight: 21, flex: 1 },

  closeSheet:    {
    marginTop: 18, backgroundColor: '#2a2030', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  closeSheetTxt: { color: '#e8e0ee', fontSize: 16, fontWeight: '600' },

  // Face sheet
  faceSheetTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  faceRow:        { gap: 16, paddingHorizontal: 4, paddingBottom: 8 },
  faceCard:       { alignItems: 'center', width: 90 },
  faceAvatar:     { width: 80, height: 80, borderRadius: 40, marginBottom: 8 },
  faceAvatarEmpty: { backgroundColor: '#2a2030', justifyContent: 'center', alignItems: 'center' },
  faceAvatarEmptyText: { fontSize: 30 },
  faceCardName:   { color: '#e8e0ee', fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 2 },
  faceCardEdit:   { color: '#9e96a4', fontSize: 11, textAlign: 'center' },

  // Rename modal
  renameOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 32 },
  renameCard:    { backgroundColor: '#1a1118', borderRadius: 16, padding: 24 },
  renameTitle:   { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 14 },
  renameInput:   {
    backgroundColor: '#2a2030', borderRadius: 10, padding: 12,
    fontSize: 15, color: '#e8e0ee', marginBottom: 20,
  },
  renameRow:     { flexDirection: 'row', gap: 10 },
  renameCancel:  { flex: 1, backgroundColor: '#2a2030', borderRadius: 10, padding: 12, alignItems: 'center' },
  renameCancelText: { color: '#9e96a4', fontWeight: '600' },
  renameSave:    { flex: 1, backgroundColor: '#6428b4', borderRadius: 10, padding: 12, alignItems: 'center' },
  renameSaveText: { color: '#fff', fontWeight: '700' },
});
