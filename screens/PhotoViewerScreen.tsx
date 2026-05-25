import React from 'react';
import {
  View, TouchableOpacity, Text, StyleSheet,
  Dimensions, StatusBar,
} from 'react-native';
import SmartImage from '../components/SmartImage';

const { width, height } = Dimensions.get('window');

export default function PhotoViewerScreen({
  folderPath, photoName, onBack,
}: {
  folderPath: string;
  photoName: string;
  onBack: () => void;
}) {
  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <SmartImage
        folderPath={folderPath}
        photoName={photoName}
        style={styles.image}
        resizeMode="contain"
      />
      <TouchableOpacity style={styles.closeBtn} onPress={onBack}>
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  image: { width, height },
  closeBtn: {
    position: 'absolute', top: 48, right: 20,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20,
    width: 36, height: 36, justifyContent: 'center', alignItems: 'center',
  },
  closeText: { color: '#fff', fontSize: 16 },
});
