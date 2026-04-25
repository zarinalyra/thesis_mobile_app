import React, { useRef, useEffect, useState } from 'react';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
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
  latitude: 14.197607,
  longitude: 120.884344,
  latitudeDelta: 0.0006,
  longitudeDelta: 0.0006,
};

export default function MapComponent({ markers, onMapPress, onMarkerPress, farmName }: MapComponentProps) {
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<Region>(FARM_REGION);

  const handleMapReady = () => {
    mapRef.current?.animateToRegion(FARM_REGION, 500);
  };

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    mapRef.current.animateToRegion(FARM_REGION, 500);
  }, [markers.length]);

  const getMarkerScale = () => {
    if (region.latitudeDelta <= 0.00045) {
      return 0.7;
    }

    if (region.latitudeDelta <= 0.0009) {
      return 0.8;
    }

    return 0.9;
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        mapType="hybrid"
        initialRegion={FARM_REGION}
        onMapReady={handleMapReady}
        onRegionChangeComplete={(nextRegion) => setRegion(nextRegion)}
        onPress={onMapPress}
        showsUserLocation
        showsMyLocationButton
      >
        {markers.map((marker) => {
          const markerScale = getMarkerScale();
          const markerHasDisease =
            marker.hasDisease === true ||
            String(marker.hasDisease).toLowerCase() === 'true';

          return (
            <Marker
              key={marker.id}
              coordinate={marker.coordinate}
              title={marker.title}
              description={markerHasDisease ? 'Disease detected' : 'Healthy tree'}
              pinColor={markerHasDisease ? '#FF9800' : '#4CAF50'}
              onPress={() => onMarkerPress?.(marker)}
              style={{ transform: [{ scale: markerScale }] }}
            />
          );
        })}
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
