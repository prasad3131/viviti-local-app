import React, { useEffect, useState } from 'react';
import { loadSession, Session } from './lib/storage';
import SetupScreen from './screens/SetupScreen';
import DashboardScreen from './screens/DashboardScreen';
import BrowserScreen from './screens/BrowserScreen';
import PhotoViewerScreen from './screens/PhotoViewerScreen';

type Screen = 'loading' | 'setup' | 'dashboard' | 'browser' | 'viewer';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [currentFolderPath, setCurrentFolderPath] = useState('');
  const [currentPhoto, setCurrentPhoto] = useState('');

  useEffect(() => {
    loadSession().then(s => {
      setSession(s);
      setScreen(s ? 'dashboard' : 'setup');
    });
  }, []);

  function handleSetupDone() {
    loadSession().then(s => {
      setSession(s);
      setScreen('dashboard');
    });
  }

  function handleLogout() {
    setSession(null);
    setScreen('setup');
  }

  if (screen === 'loading') return null;

  if (screen === 'setup' || !session) {
    return <SetupScreen onSetupDone={handleSetupDone} />;
  }

  if (screen === 'viewer') {
    return (
      <PhotoViewerScreen
        folderPath={currentFolderPath}
        photoName={currentPhoto}
        onBack={() => setScreen('browser')}
      />
    );
  }

  if (screen === 'browser') {
    return (
      <BrowserScreen
        username={session.username}
        onBack={() => setScreen('dashboard')}
        onOpenPhoto={(folderPath, name) => {
          setCurrentFolderPath(folderPath);
          setCurrentPhoto(name);
          setScreen('viewer');
        }}
      />
    );
  }

  return (
    <DashboardScreen
      session={session}
      onLogout={handleLogout}
      onOpenPhotos={() => setScreen('browser')}
    />
  );
}
