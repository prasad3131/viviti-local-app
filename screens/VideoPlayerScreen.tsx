import React, { useEffect, useRef, useState } from 'react';
import {
  View, TouchableOpacity, TouchableWithoutFeedback, Text, StyleSheet,
  ActivityIndicator, StatusBar, PanResponder,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { photoUrlSync, videoUrl } from '../lib/api';

const SPEEDS = [1, 1.5, 2, 0.5];

function fmt(t: number) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface Props {
  folderPath: string;
  videoName: string;
  onBack: () => void;
}

export default function VideoPlayerScreen({ folderPath, videoName, onBack }: Props) {
  const [uri, setUri] = useState<string | null>(() => photoUrlSync(folderPath, videoName));
  useEffect(() => {
    if (uri) return;
    videoUrl(folderPath, videoName).then(setUri).catch(() => {});
  }, [folderPath, videoName, uri]);

  const player = useVideoPlayer(null, p => { p.loop = false; });

  const [playing, setPlaying] = useState(true);
  const [cur, setCur]   = useState(0);
  const [dur, setDur]   = useState(0);
  const [vol, setVol]   = useState(1);
  const [rate, setRate] = useState(1);
  const [show, setShow] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!uri) return;
    try { player.replace(uri); player.play(); } catch {}
  }, [uri, player]);

  // Poll player state for the progress bar / play state
  useEffect(() => {
    const id = setInterval(() => {
      try {
        setCur(player.currentTime ?? 0);
        setDur(player.duration ?? 0);
        setPlaying(player.playing);
      } catch {}
    }, 250);
    return () => clearInterval(id);
  }, [player]);

  // Auto-hide controls a few seconds after playback resumes
  function scheduleHide() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      try { if (player.playing) setShow(false); } catch {}
    }, 3000);
  }
  useEffect(() => {
    if (show && playing) scheduleHide();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [show, playing]);

  function reveal() { setShow(true); scheduleHide(); }
  function toggleControls() { setShow(s => !s); }

  function togglePlay() {
    try {
      if (player.playing) { player.pause(); setShow(true); }
      else { player.play(); reveal(); }
    } catch {}
  }

  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length];
    try { player.playbackRate = next; } catch {}
    setRate(next);
    reveal();
  }

  // ── Seek bar ──
  const seekW = useRef(1);
  const seekTo = (x: number) => {
    const frac = Math.max(0, Math.min(1, x / seekW.current));
    const d = player.duration || 0;
    try { player.currentTime = frac * d; } catch {}
    setCur(frac * d);
    reveal();
  };
  const seekPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: e => seekTo(e.nativeEvent.locationX),
    onPanResponderMove:  e => seekTo(e.nativeEvent.locationX),
  })).current;

  // ── Volume bar ──
  const volW = useRef(1);
  const setVolTo = (x: number) => {
    const v = Math.max(0, Math.min(1, x / volW.current));
    try { player.volume = v; player.muted = v === 0; } catch {}
    setVol(v);
    reveal();
  };
  const volPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: e => setVolTo(e.nativeEvent.locationX),
    onPanResponderMove:  e => setVolTo(e.nativeEvent.locationX),
  })).current;

  const pct = dur > 0 ? (cur / dur) * 100 : 0;

  return (
    <View style={s.container}>
      <StatusBar hidden />

      <TouchableWithoutFeedback onPress={toggleControls}>
        <View style={StyleSheet.absoluteFill}>
          {uri ? (
            <VideoView
              player={player}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              nativeControls={false}
            />
          ) : (
            <View style={s.center}><ActivityIndicator color="#fff" size="large" /></View>
          )}
        </View>
      </TouchableWithoutFeedback>

      {show && (
        <>
          <TouchableOpacity style={s.closeBtn} onPress={onBack}>
            <Text style={s.closeText}>✕</Text>
          </TouchableOpacity>

          {/* Center play/pause */}
          <TouchableOpacity style={s.centerBtn} onPress={togglePlay} activeOpacity={0.8}>
            <Text style={s.centerIcon}>{playing ? '⏸' : '▶'}</Text>
          </TouchableOpacity>

          {/* Bottom controls — volume + speed sit just above the progress bar */}
          <View style={s.bottom}>
            <View style={s.controlsRow}>
              <Text style={s.volIcon}>{vol === 0 ? '🔇' : '🔊'}</Text>
              <View
                style={s.volTrack}
                onLayout={e => { volW.current = e.nativeEvent.layout.width; }}
                {...volPan.panHandlers}
              >
                <View style={[s.volFill, { width: `${vol * 100}%` }]} />
                <View style={[s.knob, { left: `${vol * 100}%` }]} />
              </View>
              <TouchableOpacity style={s.speedBtn} onPress={cycleSpeed}>
                <Text style={s.speedText}>{rate}x</Text>
              </TouchableOpacity>
            </View>

            <View style={s.progressRow}>
              <Text style={s.time}>{fmt(cur)}</Text>
              <View
                style={s.seekTrack}
                onLayout={e => { seekW.current = e.nativeEvent.layout.width; }}
                {...seekPan.panHandlers}
              >
                <View style={[s.seekFill, { width: `${pct}%` }]} />
                <View style={[s.knob, { left: `${pct}%` }]} />
              </View>
              <Text style={s.time}>{fmt(dur)}</Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  closeBtn: {
    position: 'absolute', top: 48, left: 20,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20,
    width: 36, height: 36, justifyContent: 'center', alignItems: 'center',
  },
  closeText: { color: '#fff', fontSize: 16 },

  centerBtn: {
    position: 'absolute', alignSelf: 'center', top: '46%',
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center',
  },
  centerIcon: { color: '#fff', fontSize: 28 },

  bottom: {
    position: 'absolute', left: 0, right: 0, bottom: 28,
    paddingHorizontal: 16,
  },
  controlsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14,
  },
  volIcon: { fontSize: 16 },
  volTrack: {
    flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
  },
  volFill: { position: 'absolute', left: 0, height: 4, borderRadius: 2, backgroundColor: '#fff' },
  speedBtn: {
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 6,
    paddingHorizontal: 12, paddingVertical: 5, minWidth: 46, alignItems: 'center',
  },
  speedText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  time: { color: '#fff', fontSize: 12, width: 42, textAlign: 'center' },
  seekTrack: {
    flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
  },
  seekFill: { position: 'absolute', left: 0, height: 4, borderRadius: 2, backgroundColor: '#257af0' },

  knob: {
    position: 'absolute', width: 13, height: 13, borderRadius: 7,
    backgroundColor: '#fff', marginLeft: -6, top: -4.5,
  },
});
