import React, { useEffect, useRef, useState } from 'react';
import {
  View, TouchableOpacity, Text, StyleSheet, ActivityIndicator,
  StatusBar, PanResponder, Animated, Dimensions, Platform,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { photoUrlSync, videoUrl, getPhotos } from '../lib/api';

const { width, height } = Dimensions.get('screen');
const SPEEDS = [0.15, 0.25, 0.5, 1, 1.5, 2, 4, 8];
const MAX_SCALE = 4;
const TAP_SLOP = 12;
const SWIPE_DIST = 60;

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
  const [name, setName] = useState(videoName);
  useEffect(() => { setName(videoName); }, [videoName]);

  const [uri, setUri] = useState<string | null>(() => photoUrlSync(folderPath, videoName));
  useEffect(() => {
    const u = photoUrlSync(folderPath, name);
    if (u) { setUri(u); return; }
    videoUrl(folderPath, name).then(setUri).catch(() => {});
  }, [folderPath, name]);

  // Folder's videos — enables next/prev
  const [videos, setVideos] = useState<string[]>([]);
  useEffect(() => {
    getPhotos(folderPath, 0, 500)
      .then(({ photos }) => setVideos(photos.filter(p => p.isVideo).map(p => p.name)))
      .catch(() => {});
  }, [folderPath]);
  const idx = videos.indexOf(name);
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < videos.length - 1;

  const player = useVideoPlayer(null, p => { p.loop = false; });

  const [playing, setPlaying] = useState(true);
  const [cur, setCur]   = useState(0);
  const [dur, setDur]   = useState(0);
  const [vol, setVol]   = useState(1);
  const [rate, setRate] = useState(1);
  const [show, setShow] = useState(true);
  const [showSpeed, setShowSpeed] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!uri) return;
    (async () => {
      try {
        // On Android, replace() is reliable. replaceAsync avoids an iOS-only
        // main-thread warning, so use it only there.
        if (Platform.OS === 'ios' && typeof (player as any).replaceAsync === 'function') {
          await (player as any).replaceAsync(uri);
        } else {
          player.replace(uri);
        }
        player.play();
      } catch {}
    })();
  }, [uri, player]);

  const seeking = useRef(false);
  useEffect(() => {
    const id = setInterval(() => {
      try {
        if (!seeking.current) setCur(player.currentTime ?? 0);  // don't fight the finger
        setDur(player.duration ?? 0);
        setPlaying(player.playing);
        setBuffering((player as any).status === 'loading');
      } catch {}
    }, 200);
    return () => clearInterval(id);
  }, [player]);

  function scheduleHide() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      try { if (player.playing) { setShow(false); setShowSpeed(false); } } catch {}
    }, 3000);
  }
  useEffect(() => {
    if (show && playing) scheduleHide();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [show, playing]);

  function reveal() { setShow(true); scheduleHide(); }

  function togglePlay() {
    try {
      if (player.playing) {
        player.pause();
        setPlaying(false);   // optimistic — flip icon instantly
        setShow(true);
      } else {
        const d = player.duration || 0;
        // If the video ended, restart from the beginning.
        if (d > 0 && player.currentTime >= d - 0.25) {
          player.currentTime = 0;
          setCur(0);
        }
        player.play();
        setPlaying(true);    // optimistic — flip icon instantly
        reveal();
      }
    } catch {}
  }

  function setSpeed(r: number) {
    try { player.playbackRate = r; } catch {}
    setRate(r);
    setShowSpeed(false);
    reveal();
  }

  // ── Seek bar ── follow the finger live, seek the player once on release
  const seekW = useRef(1);
  const seekFrac = useRef(0);
  const seekVisual = (x: number) => {
    const frac = Math.max(0, Math.min(1, x / seekW.current));
    seekFrac.current = frac;
    setCur(frac * (player.duration || 0));
  };
  const seekPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: e => { seeking.current = true; seekVisual(e.nativeEvent.locationX); reveal(); },
    onPanResponderMove:  e => seekVisual(e.nativeEvent.locationX),
    onPanResponderRelease: () => {
      try { player.currentTime = seekFrac.current * (player.duration || 0); } catch {}
      setTimeout(() => { seeking.current = false; }, 300); // let the player settle
      reveal();
    },
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

  // ── Zoom / pan / tap-to-toggle ──
  const scale = useRef(new Animated.Value(1)).current;
  const tX = useRef(new Animated.Value(0)).current;
  const tY = useRef(new Animated.Value(0)).current;
  const z = useRef({ scale: 1, x: 0, y: 0 });
  const g = useRef({ pinching: false, startDist: 0, startScale: 1, startX: 0, startY: 0, moved: 0 });

  const dist = (ts: any[]) => Math.hypot(ts[0].pageX - ts[1].pageX, ts[0].pageY - ts[1].pageY);
  function clampPan() {
    const sc = z.current.scale;
    const mx = (width * (sc - 1)) / 2;
    const my = (height * (sc - 1)) / 2;
    z.current.x = Math.max(-mx, Math.min(mx, z.current.x));
    z.current.y = Math.max(-my, Math.min(my, z.current.y));
    tX.setValue(z.current.x); tY.setValue(z.current.y);
  }
  function resetZoom() {
    z.current = { scale: 1, x: 0, y: 0 };
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: false, bounciness: 0 }),
      Animated.spring(tX, { toValue: 0, useNativeDriver: false, bounciness: 0 }),
      Animated.spring(tY, { toValue: 0, useNativeDriver: false, bounciness: 0 }),
    ]).start();
  }

  function goPrev() { if (hasPrev) { resetZoom(); setName(videos[idx - 1]); reveal(); } }
  function goNext() { if (hasNext) { resetZoom(); setName(videos[idx + 1]); reveal(); } }
  // Live ref so the once-created gesture handler always calls the current fns.
  const navRef = useRef({ next: () => {}, prev: () => {} });
  navRef.current.next = goNext;
  navRef.current.prev = goPrev;

  const gesture = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (e, gs) =>
      e.nativeEvent.touches.length === 2 ||
      z.current.scale > 1.01 ||
      Math.abs(gs.dx) + Math.abs(gs.dy) > TAP_SLOP,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: e => {
      g.current.moved = 0;
      g.current.startScale = z.current.scale;
      g.current.startX = z.current.x;
      g.current.startY = z.current.y;
      g.current.pinching = e.nativeEvent.touches.length === 2;
      if (g.current.pinching) g.current.startDist = dist(e.nativeEvent.touches);
    },
    onPanResponderMove: (e, gs) => {
      const ts = e.nativeEvent.touches;
      g.current.moved = Math.max(g.current.moved, Math.abs(gs.dx) + Math.abs(gs.dy));
      if (ts.length === 2) {
        if (!g.current.pinching) { g.current.pinching = true; g.current.startDist = dist(ts); g.current.startScale = z.current.scale; }
        const sc = Math.max(1, Math.min(MAX_SCALE, g.current.startScale * dist(ts) / (g.current.startDist || 1)));
        z.current.scale = sc; scale.setValue(sc); clampPan();
      } else if (z.current.scale > 1.01 && !g.current.pinching) {
        z.current.x = g.current.startX + gs.dx;
        z.current.y = g.current.startY + gs.dy;
        clampPan();
      }
    },
    onPanResponderRelease: (_e, gs) => {
      if (g.current.pinching) {
        g.current.pinching = false;
        if (z.current.scale <= 1.01) resetZoom(); else clampPan();
        return;
      }
      if (g.current.moved < TAP_SLOP) { setShow(sh => !sh); return; }
      // Horizontal swipe → next/prev video (only when not zoomed)
      if (z.current.scale <= 1.01 && Math.abs(gs.dx) > Math.abs(gs.dy) && Math.abs(gs.dx) > SWIPE_DIST) {
        if (gs.dx < 0) navRef.current.next(); else navRef.current.prev();
      }
    },
  })).current;

  const pct = dur > 0 ? (cur / dur) * 100 : 0;

  return (
    <View style={s.container}>
      <StatusBar hidden />

      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale }, { translateX: tX }, { translateY: tY }] }]}>
        {uri ? (
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
        ) : (
          <View style={s.center}><ActivityIndicator color="#fff" size="large" /></View>
        )}
      </Animated.View>

      {/* Gesture catcher sits ON TOP of the native video so taps/pinch register */}
      <View style={StyleSheet.absoluteFill} {...gesture.panHandlers} />

      {/* Buffering spinner — shows the player is loading/streaming, not frozen */}
      {buffering && (
        <View style={[StyleSheet.absoluteFill, s.center]} pointerEvents="none">
          <ActivityIndicator color="#fff" size="large" />
        </View>
      )}

      {show && (
        <>
          <TouchableOpacity style={s.closeBtn} onPress={onBack}>
            <Text style={s.closeText}>✕</Text>
          </TouchableOpacity>

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

          {!buffering && (
            <TouchableOpacity style={s.centerBtn} onPress={togglePlay} activeOpacity={0.8}>
              <Text style={s.centerIcon}>{playing ? '⏸' : '▶'}</Text>
            </TouchableOpacity>
          )}

          {showSpeed && (
            <View style={s.speedMenu}>
              {SPEEDS.map(sp => (
                <TouchableOpacity
                  key={sp}
                  style={[s.speedItem, sp === rate && s.speedItemActive]}
                  onPress={() => setSpeed(sp)}
                >
                  <Text style={[s.speedItemText, sp === rate && s.speedItemTextActive]}>{sp}x</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

        </>
      )}

      {/* Progress bar is always visible; volume + speed only when controls shown */}
      <View style={s.bottom}>
        {show && (
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
            <TouchableOpacity style={s.speedBtn} onPress={() => { setShowSpeed(v => !v); reveal(); }}>
              <Text style={s.speedText}>{rate}x</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={s.progressRow}>
          <Text style={s.time}>{fmt(cur)}</Text>
          <View
            style={s.seekHit}
            onLayout={e => { seekW.current = e.nativeEvent.layout.width; }}
            {...seekPan.panHandlers}
          >
            <View style={s.seekTrack}>
              <View style={[s.seekFill, { width: `${pct}%` }]} />
              <View style={[s.seekKnob, { left: `${pct}%` }]} />
            </View>
          </View>
          <Text style={s.time}>{fmt(dur)}</Text>
        </View>
      </View>
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

  arrowLeft: {
    position: 'absolute', left: 0, top: '50%', marginTop: -34,
    paddingVertical: 18, paddingLeft: 8, paddingRight: 16,
    backgroundColor: 'rgba(0,0,0,0.4)', borderTopRightRadius: 30, borderBottomRightRadius: 30,
  },
  arrowRight: {
    position: 'absolute', right: 0, top: '50%', marginTop: -34,
    paddingVertical: 18, paddingRight: 8, paddingLeft: 16,
    backgroundColor: 'rgba(0,0,0,0.4)', borderTopLeftRadius: 30, borderBottomLeftRadius: 30,
  },
  arrowText: { color: 'rgba(255,255,255,0.92)', fontSize: 36, fontWeight: '200', lineHeight: 40 },

  centerBtn: {
    position: 'absolute', alignSelf: 'center', top: '46%',
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center',
  },
  centerIcon: { color: '#fff', fontSize: 28 },

  bottom: { position: 'absolute', left: 0, right: 0, bottom: 28, paddingHorizontal: 16 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  volIcon: { fontSize: 16 },
  volTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center' },
  volFill: { position: 'absolute', left: 0, height: 4, borderRadius: 2, backgroundColor: '#fff' },
  speedBtn: {
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 6,
    paddingHorizontal: 12, paddingVertical: 5, minWidth: 46, alignItems: 'center',
  },
  speedText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  speedMenu: {
    position: 'absolute', left: 16, right: 16, bottom: 108,
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 12, padding: 12,
  },
  speedItem: {
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8, minWidth: 52, alignItems: 'center',
  },
  speedItemActive: { backgroundColor: '#257af0' },
  speedItemText: { color: '#e8e0ee', fontSize: 14, fontWeight: '600' },
  speedItemTextActive: { color: '#fff', fontWeight: '800' },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  time: { color: '#fff', fontSize: 13, width: 44, textAlign: 'center' },
  // Tall, transparent touch area so the slim bar is easy to grab.
  seekHit: { flex: 1, height: 24, justifyContent: 'center' },
  seekTrack: { height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' },
  seekFill: { position: 'absolute', left: 0, height: 7, borderRadius: 4, backgroundColor: '#257af0' },
  seekKnob: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', marginLeft: -9, top: -5.5 },

  knob: { position: 'absolute', width: 13, height: 13, borderRadius: 7, backgroundColor: '#fff', marginLeft: -6, top: -4.5 },
});
