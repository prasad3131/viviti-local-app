import React, { useState } from 'react';
import {
  Text, TextInput, TouchableOpacity, StyleSheet, View,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { checkDevice, registerUser } from '../lib/api';
import { saveSession } from '../lib/storage';

const SCAN_TIMEOUT_MS = 1200;
const SCAN_BATCH = 50; // stay within OkHttp's 64-request concurrency limit

// Most likely range (.100–.254) first so DHCP devices are found quickly
function buildScanList(): string[] {
  const ips: string[] = [];
  for (const subnet of ['192.168.1', '192.168.0']) {
    for (let i = 100; i <= 254; i++) ips.push(`${subnet}.${i}`);
  }
  for (const subnet of ['192.168.1', '192.168.0']) {
    for (let i = 1; i <= 99; i++) ips.push(`${subnet}.${i}`);
  }
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

export default function SetupScreen({ onSetupDone }: { onSetupDone: () => void }) {
  const [ip, setIp] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);

  async function scanForDevice() {
    setScanning(true);
    const allIps = buildScanList();
    let found: string | null = null;
    for (let i = 0; i < allIps.length && !found; i += SCAN_BATCH) {
      const batch = allIps.slice(i, i + SCAN_BATCH);
      try {
        found = await Promise.any(batch.map(probeIp));
      } catch { /* batch had no match, continue */ }
    }
    setScanning(false);
    if (found) {
      setIp(found);
      Alert.alert('Device found!', `Viviti device found at ${found}`);
    } else {
      Alert.alert('Not found', 'No Viviti device found on this WiFi.\n\nMake sure the device is powered on and connected to the same network.');
    }
  }

  async function handleConnect() {
    const trimmedIp = ip.trim();
    const trimmedName = username.trim();
    if (!trimmedIp) {
      Alert.alert('Missing IP', 'Enter or scan for the device IP address.');
      return;
    }
    if (!trimmedName) {
      Alert.alert('Missing name', 'Enter your name exactly as you entered it on the device page.');
      return;
    }
    setLoading(true);
    try {
      const reachable = await checkDevice(trimmedIp);
      if (!reachable) {
        Alert.alert(
          'Cannot reach device',
          `Could not connect to http://${trimmedIp}:3000\n\nMake sure your phone and device are on the same WiFi.`,
        );
        return;
      }
      const resolvedName = await registerUser(trimmedIp, trimmedName);
      await saveSession({ deviceIp: trimmedIp, deviceName: 'Viviti Local', username: resolvedName });
      onSetupDone();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Connection failed.');
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
          Enter the same name you used on the device setup page.
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
  logo: { fontSize: 36, fontWeight: '800', color: '#257af0', marginBottom: 4 },
  subtitle: { fontSize: 16, color: '#6b6070', marginBottom: 36 },
  label: { fontSize: 13, fontWeight: '600', color: '#1a1118', marginBottom: 6 },
  ipRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
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
  btn: {
    backgroundColor: '#257af0', borderRadius: 10,
    padding: 14, alignItems: 'center', marginTop: 8,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
