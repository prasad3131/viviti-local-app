import React, { useState } from 'react';
import {
  Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { checkDevice, registerUser } from '../lib/api';
import { saveSession } from '../lib/storage';

export default function SetupScreen({ onSetupDone }: { onSetupDone: () => void }) {
  const [ip, setIp] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    const trimmedIp = ip.trim();
    const trimmedName = username.trim();
    if (!trimmedIp) {
      Alert.alert('Missing IP', 'Enter the device IP address shown on the landing page.');
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
        <TextInput
          style={styles.input}
          placeholder="e.g. 192.168.1.213"
          value={ip}
          onChangeText={setIp}
          autoCapitalize="none"
          keyboardType="numeric"
        />
        <Text style={styles.hint}>
          Visit http://&lt;device-ip&gt;:3000 in your phone browser to get the IP and create your profile.
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

        <TouchableOpacity style={styles.btn} onPress={handleConnect} disabled={loading}>
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
  input: {
    borderWidth: 1, borderColor: '#e0dbe2', borderRadius: 10,
    padding: 12, fontSize: 15, marginBottom: 8, backgroundColor: '#fff',
  },
  hint: { fontSize: 12, color: '#9e96a4', marginBottom: 24 },
  btn: {
    backgroundColor: '#257af0', borderRadius: 10,
    padding: 14, alignItems: 'center', marginTop: 8,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
