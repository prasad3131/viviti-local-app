import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'viviti_local_session';

export interface Session {
  deviceIp: string;
  deviceName: string;
  username: string;
}

export async function saveSession(s: Session) {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}

export async function loadSession(): Promise<Session | null> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Session) : null;
}

export async function clearSession() {
  await AsyncStorage.removeItem(KEY);
}
