import React, { useState } from 'react';
import {
  View, TouchableOpacity, Text, StyleSheet,
  Dimensions, StatusBar, Modal, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import SmartImage from '../components/SmartImage';
import { critiquePhoto, CritiqueResult, CritiqueIssue } from '../lib/api';

const { width, height } = Dimensions.get('window');

const SEV_COLOR: Record<string, string> = {
  high: '#f43f5e', medium: '#f97316', low: '#eab308',
};

const MOOD_EMOJI: Record<string, string> = {
  warm: '🌅', cool: '🌊', neutral: '⚖️',
};

function scoreColor(s: number) {
  if (s >= 80) return '#22c55e';
  if (s >= 60) return '#f97316';
  return '#f43f5e';
}

function scoreLabel(s: number) {
  if (s >= 85) return 'Outstanding';
  if (s >= 70) return 'Good';
  if (s >= 55) return 'Decent';
  if (s >= 40) return 'Needs Work';
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

export default function PhotoViewerScreen({
  folderPath, photoName, onBack,
}: {
  folderPath: string;
  photoName: string;
  onBack: () => void;
}) {
  const [critiquing, setCritiquing] = useState(false);
  const [result, setResult] = useState<CritiqueResult | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  async function onCritique() {
    setCritiquing(true);
    try {
      const r = await critiquePhoto(folderPath, photoName);
      if (r.error) throw new Error(r.error);
      setResult(r);
      setSheetVisible(true);
    } catch {
      Alert.alert(
        'Critique unavailable',
        'Make sure Python and OpenCV are installed on the device.\n\npip install opencv-python',
      );
    } finally {
      setCritiquing(false);
    }
  }

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

      <TouchableOpacity style={s.critiqueBtn} onPress={onCritique} disabled={critiquing}>
        {critiquing
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={s.critiqueTxt}>⭐ Critique</Text>}
      </TouchableOpacity>

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
              {/* Score header */}
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
                <View style={[s.barFill, { width: `${result.score}%` as any, backgroundColor: scoreColor(result.score) }]} />
              </View>

              <ScrollView style={s.list} showsVerticalScrollIndicator={false}>

                {/* 1. Interpretation */}
                <Section title={`${MOOD_EMOJI[result.mood] ?? '🎨'} Interpretation`}>
                  <Text style={s.descText}>{result.mood_desc}</Text>
                  <Text style={s.descText}>{result.composition_feel}</Text>
                  <Text style={s.metaLine}>
                    {result.orientation.charAt(0).toUpperCase() + result.orientation.slice(1)} · {result.aspect_ratio}
                  </Text>
                </Section>

                {/* 2. Technical */}
                {result.technical.length > 0 && (
                  <Section title="🔧 Technical">
                    {result.technical.map((i, idx) => <IssueRow key={idx} issue={i} />)}
                  </Section>
                )}

                {/* 3. Artistic */}
                {result.artistic.length > 0 && (
                  <Section title="🎭 Artistic">
                    {result.artistic.map((i, idx) => <IssueRow key={idx} issue={i} />)}
                  </Section>
                )}

                {/* 4. Good Points */}
                <Section title="✨ What Works">
                  {result.good_points.map((p, idx) => <GoodRow key={idx} text={p} />)}
                </Section>

                {/* 5. Improvements */}
                {result.improvements.length > 0 && (
                  <Section title="📈 Points to Improve">
                    {result.improvements.map((i, idx) => <IssueRow key={idx} issue={i} />)}
                  </Section>
                )}

                {/* 6. Overall */}
                <Section title="📷 Overall">
                  <Text style={s.descText}>{result.overall}</Text>
                </Section>

              </ScrollView>
            </>
          )}

          <TouchableOpacity style={s.closeSheet} onPress={() => setSheetVisible(false)}>
            <Text style={s.closeSheetTxt}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  image:        { width, height },

  closeBtn:     {
    position: 'absolute', top: 48, right: 20,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20,
    width: 36, height: 36, justifyContent: 'center', alignItems: 'center',
  },
  closeText:    { color: '#fff', fontSize: 16 },

  critiqueBtn:  {
    position: 'absolute', bottom: 52, alignSelf: 'center',
    backgroundColor: 'rgba(37,122,240,0.92)', borderRadius: 24,
    paddingHorizontal: 28, paddingVertical: 13,
    minWidth: 130, justifyContent: 'center', alignItems: 'center',
  },
  critiqueTxt:  { color: '#fff', fontSize: 15, fontWeight: '700' },

  overlay:      { flex: 1 },
  sheet:        {
    backgroundColor: '#1a1118', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40,
    maxHeight: height * 0.65,
  },
  handle:       {
    width: 40, height: 4, backgroundColor: '#3d3344', borderRadius: 2,
    alignSelf: 'center', marginBottom: 22,
  },

  scoreRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  scoreLbl:     { color: '#9e96a4', fontSize: 14, fontWeight: '600' },
  scoreRating:  { fontSize: 18, fontWeight: '700', marginTop: 2 },
  scoreNum:     { fontSize: 40, fontWeight: '800' },
  scoreOf:      { fontSize: 16, fontWeight: '400', color: '#6b6070' },


  barBg:        { height: 6, borderRadius: 3, backgroundColor: '#2a2030', marginBottom: 22, overflow: 'hidden' },
  barFill:      { height: 6, borderRadius: 3 },

  list:         { flex: 1 },

  section:      { marginBottom: 20 },
  sectionTitle: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginBottom: 10 },
  descText:     { color: '#c0b8cc', fontSize: 14, lineHeight: 21, marginBottom: 6 },
  metaLine:     { color: '#6b6070', fontSize: 12, marginTop: 2 },

  issueRow:     { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  sevDot:       { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  checkMark:    { color: '#22c55e', fontSize: 14, marginTop: 1, width: 16, textAlign: 'center' },
  issueMsg:     { color: '#e8e0ee', fontSize: 14, lineHeight: 21, flex: 1 },

  closeSheet:   {
    marginTop: 18, backgroundColor: '#2a2030', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  closeSheetTxt: { color: '#e8e0ee', fontSize: 16, fontWeight: '600' },
});
