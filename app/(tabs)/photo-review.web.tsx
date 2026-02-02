import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function PhotoReviewScreen() {
  const { farmId } = useLocalSearchParams();
  const router = useRouter();

  const handleBackPress = () => {
    router.push(`/(tabs)/farm-map?farmId=${farmId}`);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={handleBackPress}>
          <IconSymbol name="map" size={24} color="#000" />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Add New Tree to Farm-{farmId}</ThemedText>
        <View style={styles.spacer} />
      </View>

      <View style={styles.content}>
        <ThemedText style={styles.message}>
          Photo review is only available on mobile devices.
        </ThemedText>
        <ThemedText style={styles.submessage}>
          Please use the Expo Go app on your phone to capture and review photos.
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E8F5E9',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 50,
    paddingBottom: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    position: 'relative',
  },
  backButton: {
    paddingLeft: 15,
  },
  spacer: {
    width: 24,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    flex: 1,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  message: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
    marginBottom: 12,
  },
  submessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
