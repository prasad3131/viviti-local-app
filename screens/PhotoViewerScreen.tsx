import React, { useState } from 'react';
import {
  View, TouchableOpacity, Text, StyleSheet,
  Dimensions, StatusBar, Modal, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import SmartImage from '../components/SmartImage';
import { critiquePhoto, CritiqueResult, CritiqueIssue } from '../lib/api';

const { width, height } = Dimensions.get('window');

const SEV_COLOR: Record<string, string> = {
  high: '#f43f5e', medium: '#f97316', low: '#eab308', none: '#22c55e',
};

function scoreColor(s: number) {
  if (s >= 80) return '#22c55e';
  if (s >= 60) return '#f97316';
  return '#f43f5e';
}

function scoreLabel(s: number) {
  if (s >= 80) return 'Excellent';
  if (s >= 60) return 'Good';
  if (s >= 40) return 'Needs Work';
  return 'Poor';
}

function blurLabel(v: number) {
  if (v >= 200) return 'Sharp';
  if (v >= 100) return 'Slightly soft';
  if (v >= 50)  return 'Blurry';
  return 'Very blurry';
}

function brightnessLabel(v: number) {
  if (v > 200) return 'Overexposed';
  if (v > 160) return 'Slightly bright';
  if (v > 60)  return 'Well exposed';
  if (v > 30)  return 'Slightly dark';
  return 'Underexposed';
}

function noiseLabel(v: number) {
  if (v < 3)  return 'Clean';
  if (v < 6)  return 'Slight noise';
  if (v < 10) return 'Noisy';
  return 'Very noisy';
}

function IssueRow({ issue }: { issue: CritiqueIssue }) {
  const color = SEV_COLOR[issue.sev] ?? '#888';
  const dot = issue.sev === 'none' ? '✓' : '●';
  return (
    <View style={s.issueRow}>
      <Text style={[s.issueDot, { color }]}>{dot}</Text>
      <Text style={s.issueMsg}>{issue.msg}</Text>
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
              <View style={s.scoreRow}>
                <View>
                  <Text style={s.scoreLbl}>Photo Score</Text>
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

              <View style={s.metrics}>
                <View style={s.metric}>
                  <Text style={s.metricLbl}>Focus</Text>
                  <Text style={s.metricVal}>{blurLabel(result.blur_score)}</Text>
                </View>
                <View style={s.metric}>
                  <Text style={s.metricLbl}>Exposure</Text>
                  <Text style={s.metricVal}>{brightnessLabel(result.brightness)}</Text>
                </View>
                <View style={s.metric}>
                  <Text style={s.metricLbl}>Noise</Text>
                  <Text style={s.metricVal}>{noiseLabel(result.noise)}</Text>
                </View>
              </View>

              <ScrollView style={s.list} showsVerticalScrollIndicator={false}>
                {result.issues.map((issue, i) => <IssueRow key={i} issue={issue} />)}
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

  metrics:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  metric:       { flex: 1, backgroundColor: '#2a2030', borderRadius: 10, padding: 10, marginHorizontal: 3, alignItems: 'center' },
  metricLbl:    { color: '#9e96a4', fontSize: 11, fontWeight: '600', marginBottom: 4 },
  metricVal:    { color: '#e8e0ee', fontSize: 12, fontWeight: '700', textAlign: 'center' },

  barBg:        { height: 6, borderRadius: 3, backgroundColor: '#2a2030', marginBottom: 22, overflow: 'hidden' },
  barFill:      { height: 6, borderRadius: 3 },

  list:         { flex: 1 },
  issueRow:     { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, gap: 10 },
  issueDot:     { fontSize: 13, marginTop: 3, width: 16, textAlign: 'center' },
  issueMsg:     { color: '#e8e0ee', fontSize: 14, lineHeight: 21, flex: 1 },

  closeSheet:   {
    marginTop: 18, backgroundColor: '#2a2030', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  closeSheetTxt: { color: '#e8e0ee', fontSize: 16, fontWeight: '600' },
});
