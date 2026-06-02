import React, { useEffect, useState } from 'react';
import { Alert, BackHandler, StyleSheet, View } from 'react-native';
import { loadSession, Session } from './lib/storage';
import SetupScreen from './screens/SetupScreen';
import DashboardScreen from './screens/DashboardScreen';
import BrowserScreen from './screens/BrowserScreen';
import PhotoViewerScreen from './screens/PhotoViewerScreen';
import FacesScreen from './screens/FacesScreen';
import FacePhotosScreen from './screens/FacePhotosScreen';
import AlbumsScreen from './screens/AlbumsScreen';
import AlbumPhotosScreen from './screens/AlbumPhotosScreen';
import HighlightsScreen from './screens/HighlightsScreen';
import WiFiSetupScreen from './screens/WiFiSetupScreen';
import { FaceCluster, Album } from './lib/api';

type Screen =
  | 'loading' | 'setup' | 'dashboard'
  | 'browser' | 'viewer'
  | 'faces' | 'face-photos'
  | 'albums' | 'album-photos'
  | 'highlights'
  | 'wifi-setup';

export default function App() {
  const [screen, setScreen]                       = useState<Screen>('loading');
  const [session, setSession]                     = useState<Session | null>(null);
  const [currentFolderPath, setCurrentFolderPath] = useState('');
  const [currentPhoto, setCurrentPhoto]           = useState('');
  const [currentFace, setCurrentFace]             = useState<FaceCluster | null>(null);
  const [currentAlbum, setCurrentAlbum]           = useState<Album | null>(null);
  const [prevScreen, setPrevScreen]               = useState<Screen>('dashboard');
  const [wifiSetupIp, setWifiSetupIp]             = useState('');
  const [browserScrollOffset, setBrowserScrollOffset] = useState(0);
  const [browserPhotoList, setBrowserPhotoList]   = useState<string[]>([]);

  useEffect(() => {
    loadSession().then(s => {
      setSession(s);
      setScreen(s ? 'dashboard' : 'setup');
    });
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'viewer')       { setScreen(prevScreen); return true; }
      if (screen === 'face-photos')  { setScreen('faces');     return true; }
      if (screen === 'faces')        { setScreen('dashboard'); return true; }
      if (screen === 'album-photos') { setScreen('albums');    return true; }
      if (screen === 'albums')       { setScreen('dashboard'); return true; }
      if (screen === 'highlights')   { setScreen('dashboard'); return true; }
      if (screen === 'browser')      { setScreen('dashboard'); return true; }
      if (screen === 'wifi-setup')   { setScreen(session ? 'dashboard' : 'setup'); return true; }
      return false; // dashboard/setup: allow default back (app to background)
    });
    return () => sub.remove();
  }, [screen, prevScreen, session]);

  function handleSetupDone() {
    loadSession().then(s => { setSession(s); setScreen('dashboard'); });
  }

  function openPhoto(folderPath: string, name: string, from: Screen = 'browser') {
    setCurrentFolderPath(folderPath);
    setCurrentPhoto(name);
    setPrevScreen(from);
    setScreen('viewer');
  }

  if (screen === 'loading') return null;

  // wifi-setup is checked before the session guard — initial WiFi setup has no session yet
  if (screen === 'wifi-setup') {
    const ip = wifiSetupIp || session?.deviceIp || '';
    const hasSession = !!session?.deviceIp;
    return (
      <WiFiSetupScreen
        deviceIp={ip}
        isInitialSetup={!hasSession}
        onBack={() => setScreen(hasSession ? 'dashboard' : 'setup')}
        onDone={() => {
          Alert.alert(
            'Almost there!',
            hasSession
              ? 'Your device is switching to the new WiFi.\nReconnect your phone to the new network, then pull to refresh.'
              : 'Your device is joining your home WiFi.\n\n1. Reconnect your phone to your home WiFi\n2. Come back and tap Find to continue setup.',
          );
          setScreen(hasSession ? 'dashboard' : 'setup');
          setWifiSetupIp('');
        }}
      />
    );
  }

  if (screen === 'setup' || !session) {
    return (
      <SetupScreen
        onSetupDone={handleSetupDone}
        onWifiSetup={ip => { setWifiSetupIp(ip); setScreen('wifi-setup'); }}
      />
    );
  }

  // Browser keeps BrowserScreen mounted; viewer overlays on top so grid never reloads
  if (screen === 'browser' || (screen === 'viewer' && prevScreen === 'browser')) {
    return (
      <View style={StyleSheet.absoluteFill}>
        <BrowserScreen
          username={session.username}
          onBack={() => { setBrowserScrollOffset(0); setScreen('dashboard'); }}
          onOpenPhoto={(folderPath, name) => openPhoto(folderPath, name, 'browser')}
          initialScrollOffset={browserScrollOffset}
          onScrollOffsetChange={setBrowserScrollOffset}
          onPhotoListChange={setBrowserPhotoList}
        />
        {screen === 'viewer' && (
          <View style={StyleSheet.absoluteFill}>
            <PhotoViewerScreen
              folderPath={currentFolderPath}
              photoName={currentPhoto}
              photoList={browserPhotoList}
              onBack={() => setScreen('browser')}
            />
          </View>
        )}
      </View>
    );
  }

  // Standalone viewer from faces / albums / highlights
  if (screen === 'viewer') {
    return (
      <PhotoViewerScreen
        folderPath={currentFolderPath}
        photoName={currentPhoto}
        onBack={() => setScreen(prevScreen)}
        onOpenPeople={() => setScreen('faces')}
      />
    );
  }

  if (screen === 'face-photos' && currentFace) {
    return (
      <FacePhotosScreen
        face={currentFace}
        onBack={() => setScreen('faces')}
        onOpenPhoto={(folder, name) => openPhoto(folder, name, 'face-photos')}
      />
    );
  }

  if (screen === 'faces') {
    return (
      <FacesScreen
        onBack={() => setScreen('dashboard')}
        onOpenFace={face => { setCurrentFace(face); setScreen('face-photos'); }}
      />
    );
  }

  if (screen === 'album-photos' && currentAlbum) {
    return (
      <AlbumPhotosScreen
        album={currentAlbum}
        onBack={() => setScreen('albums')}
        onOpenPhoto={(folder, name) => openPhoto(folder, name, 'album-photos')}
      />
    );
  }

  if (screen === 'albums') {
    return (
      <AlbumsScreen
        onBack={() => setScreen('dashboard')}
        onOpenAlbum={album => { setCurrentAlbum(album); setScreen('album-photos'); }}
      />
    );
  }

  if (screen === 'highlights') {
    return (
      <HighlightsScreen
        onBack={() => setScreen('dashboard')}
        onOpenPhoto={(folder, name) => openPhoto(folder, name, 'highlights')}
      />
    );
  }

  return (
    <DashboardScreen
      session={session}
      onLogout={async () => { setSession(null); setScreen('setup'); }}
      onOpenPhotos={() => setScreen('browser')}
      onOpenPeople={() => setScreen('faces')}
      onOpenAlbums={() => setScreen('albums')}
      onOpenHighlights={() => setScreen('highlights')}
      onChangeWifi={() => { setWifiSetupIp(session.deviceIp); setScreen('wifi-setup'); }}
    />
  );
}
