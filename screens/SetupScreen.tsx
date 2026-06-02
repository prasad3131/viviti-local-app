import React, { useState } from 'react';
import {
  Text, TextInput, TouchableOpacity, StyleSheet, View,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { registerUser, getDeviceHealth, invalidateSessionCache } from '../lib/api';
import { saveSession } from '../lib/storage';

const SCAN_TIMEOUT_MS = 1200;
const SCAN_BATCH = 50;

function buildScanList(): string[] {
  const ips: string[] = [];
  for (const subnet of ['192.168.1', '192.168.0']) {
    for (let i = 100; i <= 254; i++) ips.push(`${subnet}.${i}`);
  }
  for (const subnet of ['192.168.1', '192.168.0']) {
    for (let i = 1; i <= 99; i++) ips.push(`${subnet}.${i}`);
  }
  ips.unshift('10.42.0.1');
  return ips;
}

async function probeIp(ip: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SCAN_TIMEOUT_MS);
    fetch(`http://${ip}:3000/health`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(data => { clearTimeout(timer); data?.viviti === true ? resolve(ip) : reject(); })
      .catch(() => { clearTimeout(timer); reject(); });
  });
}

export default function SetupScreen({
  onSetupDone,
  onWifiSetup,
}: {
  onSetupDone: () => void;
  onWifiSetup: (ip: string) => void;
}) {
  const [ip, setIp]             = useState('');
  const [deviceKey, setDeviceKey] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [scanning, setScanning] = useState(false);

  async function scanForDevice() {
    setScanning(true);
    const allIps = buildScanList();
    let found: string | null = null;
    for (let i = 0; i < allIps.length && !found; i += SCAN_BATCH) {
      try {
        found = await Promise.any(allIps.slice(i, i + SCAN_BATCH).map(probeIp));
      } catch {}
    }
    setScanning(false);
    if (found) {
      const health = await getDeviceHealth(found);
      if (health.mode === 'ap') {
        onWifiSetup(found);
      } else {
        setIp(found);
        // Auto-fill the key from health response — no manual entry needed
        if (health.key) setDeviceKey(health.key);
        Alert.alert('Device found!', `Viviti device found at ${found}`);
      }
    } else {
      Alert.alert(
        'Not found',
        'No Viviti device found on this WiFi.\n\nIf this is a new device, connect your phone to the "Viviti-Setup" WiFi and tap Find again.',
      );
    }
  }

  async function handleConnect() {
    const trimmedIp   = ip.trim();
    const trimmedName = username.trim();
    if (!trimmedIp) {
      Alert.alert('Missing IP', 'Tap Find to locate your device, or enter the IP manually.');
      return;
    }
    if (!trimmedName) {
      Alert.alert('Missing name', 'Enter your name.');
      return;
    }
    setLoading(true);
    try {
      // Fetch health to get the key if not already set (manual IP entry path)
      let key = deviceKey;
      if (!key) {
        const health = await getDeviceHealth(trimmedIp);
        if (!health.viviti) {
          Alert.alert('Cannot reach device', `Could not connect to http://${trimmedIp}:3000\n\nMake sure your phone and device are on the same WiFi.`);
          return;
        }
        key = health.key ?? '';
      }

      const resolvedName = await registerUser(trimmedIp, trimmedName, key);
      await saveSession({ deviceIp: trimmedIp, deviceName: 'Viviti Local', username: resolvedName, deviceKey: key });
      invalidateSessionCache();

      // Register with cloud for heartbeat monitoring (optional — fails silently)
      const trimmedEmail = email.trim().toLowerCase();
      if (trimmedEmail) {
        fetch('https://vivitionline.com/api/devices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: key, name: 'Viviti Local', owner_email: trimmedEmail }),
        }).catch(() => {});
      }

      onSetupDone();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Connection failed. Make sure you are on the same WiFi as the device.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.logo}>Viviti</Text>
        <Text style={styles.subtitle}>Connect to your device</Text>

        <Text style={styles.label}>Device IP address</Text>
        <View style={styles.ipRow}>
          <TextInput
            style={[styles.input, styles.ipInput]}
            placeholder="e.g. 192.168.1.213"
            value={ip}
            onChangeText={setIp}
            autoCapitalize="none"
            keyboardType="numeric"
          />
          <TouchableOpacity style={styles.scanBtn} onPress={scanForDevice} disabled={scanning || loading}>
            {scanning
              ? <ActivityIndicator color="#257af0" size="small" />
              : <Text style={styles.scanBtnText}>Find</Text>}
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>
          Tap Find to auto-detect your Viviti device on WiFi, or enter the IP manually.
        </Text>

        <Text style={styles.label}>Your name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Prasad"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="words"
        />
        <Text style={styles.hint}>
          A folder with your name will be created on the device.
        </Text>

        <Text style={styles.label}>Your email <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
        />
        <Text style={styles.hint}>
          Get email alerts if your device goes offline or storage is running low.
        </Text>

        <TouchableOpacity style={styles.btn} onPress={handleConnect} disabled={loading || scanning}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Connect</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 28, backgroundColor: '#fefcfe' },
  logo:     { fontSize: 36, fontWeight: '800', color: '#257af0', marginBottom: 4 },
  subtitle: { fontSize: 16, color: '#6b6070', marginBottom: 36 },
  label:    { fontSize: 13, fontWeight: '600', color: '#1a1118', marginBottom: 6 },
  ipRow:    { flexDirection: 'row', gap: 8, marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: '#e0dbe2', borderRadius: 10,
    padding: 12, fontSize: 15, marginBottom: 8, backgroundColor: '#fff',
  },
  ipInput: { flex: 1, marginBottom: 0 },
  scanBtn: {
    borderWidth: 1.5, borderColor: '#257af0', borderRadius: 10,
    paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', minWidth: 64,
  },
  scanBtnText: { color: '#257af0', fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 12, color: '#9e96a4', marginBottom: 24 },
  optional: { fontSize: 12, color: '#9e96a4', fontWeight: '400' },
  btn: {
    backgroundColor: '#257af0', borderRadius: 10,
    padding: 14, alignItems: 'center', marginTop: 8,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
