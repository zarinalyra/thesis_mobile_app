import React, { useRef, useEffect } from 'react';
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
  onMarkerPress?: (marker: TreeMarker) => void;
  farmName: string;
}

const FARM_REGION = {
  latitude: 14.1977714,
  longitude: 120.8854955,
  latitudeDelta: 0.0022,
  longitudeDelta: 0.0022,
};

export default function MapComponent({ markers, onMapPress, onMarkerPress, farmName }: MapComponentProps) {
  const mapRef = useRef<MapView>(null);

  const handleMapReady = () => {
    mapRef.current?.animateToRegion(FARM_REGION, 500);
  };

  useEffect(() => {
    if (markers.length > 0) {
      mapRef.current?.fitToCoordinates(
        markers.map((m) => m.coordinate),
        { edgePadding: { top: 80, right: 80, bottom: 80, left: 80 }, animated: true }
      );
    }
  }, [markers]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        mapType="hybrid"
        initialRegion={FARM_REGION}
        onMapReady={handleMapReady}
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
            onPress={() => onMarkerPress?.(marker)}
          />
        ))}
      </MapView>
      {markers.length === 0 && (
        <View style={styles.emptyState}>
          <ThemedText style={styles.emptyText}>No trees added yet</ThemedText>
          <ThemedText style={styles.emptySubtext}>Tap Add Tree to start</ThemedText>
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
