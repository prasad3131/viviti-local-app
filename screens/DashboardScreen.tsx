import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, ScrollView,
} from 'react-native';
import { getDeviceStatus } from '../lib/api';
import { Session, clearSession } from '../lib/storage';

function formatBytes(bytes: number) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
  return (bytes / 1e6).toFixed(0) + ' MB';
}

export default function DashboardScreen({
  session,
  onLogout,
  onOpenPhotos,
  onOpenPeople,
  onOpenAlbums,
  onOpenHighlights,
  onOpenSearch,
  onChangeWifi,
}: {
  session: Session;
  onLogout: () => void;
  onOpenPhotos: () => void;
  onOpenPeople: () => void;
  onOpenAlbums: () => void;
  onOpenHighlights: () => void;
  onOpenSearch: () => void;
  onChangeWifi: () => void;
}) {
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      const s = await getDeviceStatus();
      setStatus(s);
    } catch {
      setError(`Cannot reach device at ${session.deviceIp}. Make sure the server is running and you are on the same WiFi.`);
    }
  }, [session.deviceIp]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const usedBytes = status ? status.total_bytes - status.available_bytes : 0;
  const usedPct = status && status.total_bytes ? usedBytes / status.total_bytes : 0;

  return (
    <ScrollView
      style={styles.bg}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.logo}>Viviti</Text>
        <TouchableOpacity onPress={async () => { await clearSession(); onLogout(); }}>
          <Text style={styles.logout}>Change device</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.deviceName}>{session.deviceName}</Text>
      <Text style={styles.deviceIp}>{session.deviceIp}:3000</Text>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : !status ? (
        <ActivityIndicator color="#257af0" style={{ marginTop: 40 }} />
      ) : (
        <>
          <View style={styles.card}>
            <View style={[styles.dot, { backgroundColor: '#22c55e' }]} />
            <Text style={styles.statusText}>Connected</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Storage</Text>
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${Math.round(usedPct * 100)}%` as any }]} />
            </View>
            <Text style={styles.storageText}>
              {formatBytes(usedBytes)} used of {formatBytes(status.total_bytes)}
            </Text>
          </View>

          <TouchableOpacity style={styles.btn} onPress={onOpenPhotos}>
            <Text style={styles.btnText}>Browse Photos</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.searchBtn]} onPress={onOpenSearch}>
            <Text style={styles.searchIcon}>🔍</Text>
            <Text style={styles.searchPlaceholder}>Search photos — dog, food, beach…</Text>
          </TouchableOpacity>
          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.btnHalf, styles.btnSecondary]} onPress={onOpenPeople}>
              <Text style={styles.btnSecondaryText}>👤 People</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnHalf, styles.btnSecondary]} onPress={onOpenAlbums}>
              <Text style={styles.btnSecondaryText}>📅 Albums</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onOpenHighlights}>
            <Text style={styles.btnSecondaryText}>✨ Highlights</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnSecondary, { marginTop: 24 }]} onPress={onChangeWifi}>
            <Text style={styles.btnSecondaryText}>📶 Change WiFi</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#fefcfe' },
  container: { padding: 24, paddingTop: 56 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  logo: { fontSize: 24, fontWeight: '800', color: '#257af0' },
  logout: { fontSize: 14, color: '#6b6070' },
  deviceName: { fontSize: 22, fontWeight: '700', color: '#1a1118', marginBottom: 4 },
  deviceIp: { fontSize: 13, color: '#9e96a4', marginBottom: 20 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1,
    borderColor: '#e0dbe2', padding: 16, marginBottom: 14,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginBottom: 6 },
  statusText: { fontSize: 18, fontWeight: '600', color: '#1a1118' },
  cardLabel: { fontSize: 13, color: '#6b6070', marginBottom: 10 },
  bar: { height: 8, backgroundColor: '#f0edf2', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  barFill: { height: '100%', backgroundColor: '#257af0', borderRadius: 4 },
  storageText: { fontSize: 13, color: '#6b6070' },
  btn: { backgroundColor: '#257af0', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8 },
  searchBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10,
    backgroundColor: '#f0edf2', borderRadius: 10, paddingHorizontal: 14, height: 48,
  },
  searchIcon: { fontSize: 15 },
  searchPlaceholder: { color: '#9e96a4', fontSize: 15 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btnHalf: { flex: 1, padding: 16, alignItems: 'center', borderRadius: 10 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnSecondary: { backgroundColor: '#f5f3f7', borderWidth: 1, borderColor: '#e0dbe2' },
  btnSecondaryText: { color: '#1a1118', fontSize: 16, fontWeight: '700' },
  errorBox: { backgroundColor: '#fff1f2', borderRadius: 10, padding: 16, marginTop: 16 },
  errorText: { color: '#f43f5e', fontSize: 14 },
});
