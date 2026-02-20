import React from 'react';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from './themed-text';

interface TreeMarker {
  id: string;
  coordinate: { latitude: number; longitude: number };
  title: string;
  hasDisease: boolean;
}

interface MapComponentProps {
  markers: TreeMarker[];
  onMapPress: (event: any) => void;
  farmName: string;
}

export default function MapComponent({ markers, onMapPress, farmName }: MapComponentProps) {
  const defaultRegion = {
    latitude: 14.1975602,
    longitude: 120.8843819,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

  const region = markers.length > 0 ? {
    latitude: markers[0].coordinate.latitude,
    longitude: markers[0].coordinate.longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  } : defaultRegion;

  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        mapType="hybrid"
        initialRegion={region}
        onPress={onMapPress}
        showsUserLocation
        showsMyLocationButton
      >
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            coordinate={marker.coordinate}
            title={marker.title}
            description={marker.hasDisease ? 'Disease detected' : 'Healthy tree'}
            pinColor={marker.hasDisease ? '#FF9800' : '#4CAF50'}
          />
        ))}
      </MapView>
      {markers.length === 0 && (
        <View style={styles.emptyState}>
          <ThemedText style={styles.emptyText}>No trees added yet</ThemedText>
          <ThemedText style={styles.emptySubtext}>Tap "Add Tree" to start</ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  emptyState: {
    position: 'absolute',
    top: '40%',
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 20,
    marginHorizontal: 40,
    borderRadius: 10,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
  },
});
