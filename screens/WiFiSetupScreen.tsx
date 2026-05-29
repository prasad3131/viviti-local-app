import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Modal, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { getWifiNetworks, connectToWifi, WifiNetwork } from '../lib/api';

interface Props {
  deviceIp: string;
  /** true = initial setup flow (came from SetupScreen); false = change WiFi from dashboard */
  isInitialSetup: boolean;
  onBack: () => void;
  /** Called after the connect request is sent — Pi is now transitioning to new WiFi */
  onDone: () => void;
}

export default function WiFiSetupScreen({ deviceIp, isInitialSetup, onBack, onDone }: Props) {
  const [networks, setNetworks]       = useState<WifiNetwork[]>([]);
  const [loading, setLoading]         = useState(true);
  const [rescanning, setRescanning]   = useState(false);
  const [selected, setSelected]       = useState<WifiNetwork | null>(null);
  const [password, setPassword]       = useState('');
  const [connecting, setConnecting]   = useState(false);

  const loadNetworks = useCallback(async (rescan = false) => {
    rescan ? setRescanning(true) : setLoading(true);
    try {
      const nets = await getWifiNetworks(deviceIp, rescan);
      setNetworks(nets);
    } catch {
      Alert.alert('Scan failed', 'Could not scan for WiFi networks. Make sure you are connected to the Viviti-Setup hotspot.');
    } finally {
      setLoading(false);
      setRescanning(false);
    }
  }, [deviceIp]);

  useEffect(() => { loadNetworks(false); }, [loadNetworks]);

  async function handleConnect() {
    if (!selected) return;
    if (selected.security !== 'Open' && !password.trim()) {
      Alert.alert('Password required', `Enter the password for "${selected.ssid}".`);
      return;
    }
    setConnecting(true);
    try {
      await connectToWifi(deviceIp, selected.ssid, password.trim());
      setSelected(null);
      setPassword('');
      onDone();
    } catch {
      // The 202 response may throw a network error because the Pi's AP drops as it connects.
      // That's expected — treat as success and let the caller handle reconnection.
      setSelected(null);
      setPassword('');
      onDone();
    } finally {
      setConnecting(false);
    }
  }

  function signalBars(signal: number) {
    if (signal >= 75) return '████';
    if (signal >= 50) return '███░';
    if (signal >= 25) return '██░░';
    return '█░░░';
  }

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>WiFi Setup</Text>
        <TouchableOpacity onPress={() => loadNetworks(true)} disabled={rescanning}>
          {rescanning
            ? <ActivityIndicator color="#257af0" size="small" />
            : <Text style={s.rescan}>Rescan</Text>}
        </TouchableOpacity>
      </View>

      <Text style={s.subtitle}>
        {isInitialSetup
          ? 'Choose your home WiFi so your Viviti device can join your network.'
          : 'Choose a new WiFi network for your Viviti device.'}
      </Text>

      {loading ? (
        <ActivityIndicator color="#257af0" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={networks}
          keyExtractor={n => n.ssid}
          contentContainerStyle={{ padding: 16, paddingTop: 8 }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyText}>No networks found. Tap Rescan to try again.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={s.row} onPress={() => { setSelected(item); setPassword(''); }}>
              <Text style={s.bars}>{signalBars(item.signal)}</Text>
              <View style={s.rowInfo}>
                <Text style={s.ssid}>{item.ssid}</Text>
                <Text style={s.security}>{item.security}</Text>
              </View>
              <Text style={s.arrow}>›</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Password modal */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Connect to "{selected?.ssid}"</Text>

            {selected?.security !== 'Open' && (
              <>
                <Text style={s.sheetLabel}>Password</Text>
                <TextInput
                  style={s.sheetInput}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholder="WiFi password"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleConnect}
                />
              </>
            )}

            <TouchableOpacity style={s.connectBtn} onPress={handleConnect} disabled={connecting}>
              {connecting
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.connectBtnText}>Connect</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={() => { setSelected(null); setPassword(''); }}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fefcfe' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#e0dbe2', backgroundColor: '#fefcfe',
  },
  back:   { color: '#257af0', fontSize: 16, fontWeight: '500', width: 60 },
  title:  { fontSize: 17, fontWeight: '700', color: '#1a1118' },
  rescan: { color: '#257af0', fontSize: 15, fontWeight: '600', width: 60, textAlign: 'right' },

  subtitle: { fontSize: 13, color: '#6b6070', padding: 16, paddingBottom: 4 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e0dbe2',
    padding: 14, marginBottom: 10,
  },
  bars:    { fontFamily: 'monospace', fontSize: 13, color: '#257af0', marginRight: 12 },
  rowInfo: { flex: 1 },
  ssid:    { fontSize: 15, fontWeight: '600', color: '#1a1118' },
  security:{ fontSize: 12, color: '#9e96a4', marginTop: 2 },
  arrow:   { fontSize: 20, color: '#c0bac4' },

  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#9e96a4', fontSize: 14 },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#1a1118', marginBottom: 20 },
  sheetLabel: { fontSize: 13, fontWeight: '600', color: '#1a1118', marginBottom: 6 },
  sheetInput: {
    borderWidth: 1.5, borderColor: '#e0dbe2', borderRadius: 10,
    padding: 13, fontSize: 16, marginBottom: 20, backgroundColor: '#fefcfe',
  },
  connectBtn: {
    backgroundColor: '#257af0', borderRadius: 10,
    padding: 14, alignItems: 'center', marginBottom: 10,
  },
  connectBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn:  { padding: 14, alignItems: 'center' },
  cancelBtnText: { color: '#6b6070', fontSize: 15 },
});
