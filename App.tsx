import React, { useEffect, useState } from 'react';
import { loadSession, Session } from './lib/storage';
import SetupScreen from './screens/SetupScreen';
import DashboardScreen from './screens/DashboardScreen';
import BrowserScreen from './screens/BrowserScreen';
import PhotoViewerScreen from './screens/PhotoViewerScreen';
import FacesScreen from './screens/FacesScreen';
import FacePhotosScreen from './screens/FacePhotosScreen';
import { FaceCluster } from './lib/api';

type Screen = 'loading' | 'setup' | 'dashboard' | 'browser' | 'viewer' | 'faces' | 'face-photos';

export default function App() {
  const [screen, setScreen]               = useState<Screen>('loading');
  const [session, setSession]             = useState<Session | null>(null);
  const [currentFolderPath, setCurrentFolderPath] = useState('');
  const [currentPhoto, setCurrentPhoto]   = useState('');
  const [currentFace, setCurrentFace]     = useState<FaceCluster | null>(null);
  const [prevScreen, setPrevScreen]       = useState<Screen>('dashboard');

  useEffect(() => {
    loadSession().then(s => {
      setSession(s);
      setScreen(s ? 'dashboard' : 'setup');
    });
  }, []);

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
  if (screen === 'setup' || !session) return <SetupScreen onSetupDone={handleSetupDone} />;

  if (screen === 'viewer') {
    return (
      <PhotoViewerScreen
        folderPath={currentFolderPath}
        photoName={currentPhoto}
        onBack={() => setScreen(prevScreen)}
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

  if (screen === 'browser') {
    return (
      <BrowserScreen
        username={session.username}
        onBack={() => setScreen('dashboard')}
        onOpenPhoto={(folderPath, name) => openPhoto(folderPath, name, 'browser')}
      />
    );
  }

  return (
    <DashboardScreen
      session={session}
      onLogout={async () => { setSession(null); setScreen('setup'); }}
      onOpenPhotos={() => setScreen('browser')}
      onOpenPeople={() => setScreen('faces')}
    />
  );
}
