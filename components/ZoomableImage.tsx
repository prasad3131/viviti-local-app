import React, { useEffect, useRef } from 'react';
import { Animated, PanResponder, Dimensions, StyleSheet, View } from 'react-native';
import SmartImage from './SmartImage';

const { width, height } = Dimensions.get('screen');

const MAX_SCALE      = 4;
const DOUBLE_TAP_MS  = 280;
const DOUBLE_TAP_ZOOM = 2.5;
const TAP_SLOP       = 12;   // max finger travel still counted as a tap
const SWIPE_DIST     = 60;   // min travel to trigger navigate / actions

function dist(touches: any[]) {
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

/**
 * Full-screen zoomable photo. Dependency-free (Animated + PanResponder).
 *  - pinch to zoom, drag to pan while zoomed
 *  - double-tap to toggle 1x / 2.5x
 *  - when at 1x: horizontal swipe → onSwipeLeft/Right, swipe up → onSwipeUp
 * Zoom resets whenever `photoName` changes.
 */
export default function ZoomableImage({
  folderPath, photoName, onSwipeLeft, onSwipeRight, onSwipeUp,
}: {
  folderPath: string;
  photoName: string;
  onSwipeLeft?: () => void;   // next
  onSwipeRight?: () => void;  // prev
  onSwipeUp?: () => void;     // open actions
}) {
  const scale  = useRef(new Animated.Value(1)).current;
  const transX = useRef(new Animated.Value(0)).current;
  const transY = useRef(new Animated.Value(0)).current;

  // Keep latest callbacks in a ref — the PanResponder below is created once and
  // would otherwise capture stale props.
  const cb = useRef({ onSwipeLeft, onSwipeRight, onSwipeUp });
  cb.current = { onSwipeLeft, onSwipeRight, onSwipeUp };

  // Committed numeric values (Animated.Value has no sync getter we rely on)
  const cur = useRef({ scale: 1, x: 0, y: 0 });
  const gesture = useRef({
    pinching: false,
    startDist: 0,
    startScale: 1,
    startX: 0,
    startY: 0,
    lastTap: 0,
    moved: 0,
  });

  // Reset zoom when the photo changes
  useEffect(() => {
    cur.current = { scale: 1, x: 0, y: 0 };
    scale.setValue(1); transX.setValue(0); transY.setValue(0);
  }, [photoName, folderPath]);

  function clampPan() {
    const s = cur.current.scale;
    const maxX = (width  * (s - 1)) / 2;
    const maxY = (height * (s - 1)) / 2;
    cur.current.x = Math.max(-maxX, Math.min(maxX, cur.current.x));
    cur.current.y = Math.max(-maxY, Math.min(maxY, cur.current.y));
    transX.setValue(cur.current.x);
    transY.setValue(cur.current.y);
  }

  function animateTo(s: number, x: number, y: number) {
    cur.current = { scale: s, x, y };
    Animated.parallel([
      Animated.spring(scale,  { toValue: s, useNativeDriver: true, bounciness: 0 }),
      Animated.spring(transX, { toValue: x, useNativeDriver: true, bounciness: 0 }),
      Animated.spring(transY, { toValue: y, useNativeDriver: true, bounciness: 0 }),
    ]).start();
  }

  const pan = useRef(
    PanResponder.create({
      // Grab single-touch starts on the image (buttons are siblings on top and
      // win their own area, so this doesn't block them).
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (e, gs) => {
        if (e.nativeEvent.touches.length === 2) return true;        // pinch
        if (cur.current.scale > 1.01) return true;                  // pan while zoomed
        // At 1x: only take over for a deliberate swipe (lets taps/double-taps pass)
        return (Math.abs(gs.dx) > TAP_SLOP && Math.abs(gs.dx) > Math.abs(gs.dy)) ||
               (gs.dy < -15 && Math.abs(gs.dy) > Math.abs(gs.dx) * 1.5);
      },

      onPanResponderGrant: (e) => {
        const g = gesture.current;
        g.moved = 0;
        g.startScale = cur.current.scale;
        g.startX = cur.current.x;
        g.startY = cur.current.y;
        g.pinching = e.nativeEvent.touches.length === 2;
        if (g.pinching) g.startDist = dist(e.nativeEvent.touches);
      },

      onPanResponderMove: (e, gs) => {
        const g = gesture.current;
        const touches = e.nativeEvent.touches;
        g.moved = Math.max(g.moved, Math.abs(gs.dx) + Math.abs(gs.dy));

        if (touches.length === 2) {
          // Pinch — scale around centre
          if (!g.pinching) { g.pinching = true; g.startDist = dist(touches); g.startScale = cur.current.scale; }
          const ratio = dist(touches) / (g.startDist || 1);
          const s = Math.max(1, Math.min(MAX_SCALE, g.startScale * ratio));
          cur.current.scale = s;
          scale.setValue(s);
          clampPan();
        } else if (cur.current.scale > 1.01 && !g.pinching) {
          // Drag to pan while zoomed
          cur.current.x = g.startX + gs.dx;
          cur.current.y = g.startY + gs.dy;
          clampPan();
        }
      },

      onPanResponderRelease: (e, gs) => {
        const g = gesture.current;

        if (g.pinching) {
          g.pinching = false;
          if (cur.current.scale <= 1.01) animateTo(1, 0, 0);  // snap back & recentre
          else clampPan();
          return;
        }

        const isTap = g.moved < TAP_SLOP && Math.abs(gs.dx) < TAP_SLOP && Math.abs(gs.dy) < TAP_SLOP;
        if (isTap) {
          const now = Date.now();
          if (now - g.lastTap < DOUBLE_TAP_MS) {
            // Double-tap → toggle zoom centred on tap point
            g.lastTap = 0;
            if (cur.current.scale > 1.01) {
              animateTo(1, 0, 0);
            } else {
              const fx = (width  / 2 - e.nativeEvent.locationX) * (DOUBLE_TAP_ZOOM - 1);
              const fy = (height / 2 - e.nativeEvent.locationY) * (DOUBLE_TAP_ZOOM - 1);
              const maxX = (width  * (DOUBLE_TAP_ZOOM - 1)) / 2;
              const maxY = (height * (DOUBLE_TAP_ZOOM - 1)) / 2;
              animateTo(
                DOUBLE_TAP_ZOOM,
                Math.max(-maxX, Math.min(maxX, fx)),
                Math.max(-maxY, Math.min(maxY, fy)),
              );
            }
          } else {
            g.lastTap = now;
          }
          return;
        }

        // A swipe — only navigate / open actions when NOT zoomed
        if (cur.current.scale <= 1.01) {
          if (Math.abs(gs.dx) > Math.abs(gs.dy) && Math.abs(gs.dx) > SWIPE_DIST) {
            gs.dx < 0 ? cb.current.onSwipeLeft?.() : cb.current.onSwipeRight?.();
          } else if (gs.dy < -SWIPE_DIST) {
            cb.current.onSwipeUp?.();
          }
        }
      },
    })
  ).current;

  return (
    <View style={StyleSheet.absoluteFill} {...pan.panHandlers}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ scale }, { translateX: transX }, { translateY: transY }] },
        ]}
      >
        <SmartImage
          folderPath={folderPath}
          photoName={photoName}
          style={styles.image}
          resizeMode="contain"
          thumb
          size={1080}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width, height },
});
