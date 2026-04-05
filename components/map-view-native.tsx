import React from 'react';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

interface MapViewNativeProps {
  markers: { id: string; coordinate: { latitude: number; longitude: number }; title: string }[];
  onMapPress: (event: any) => void;
  farmName: string;
}

export default function MapViewNative({ markers, onMapPress, farmName }: MapViewNativeProps) {
  return (
    <MapView
      provider={PROVIDER_GOOGLE}
      style={{ flex: 1 }}
      mapType="hybrid"
      initialRegion={{
        latitude: 14.197607,
        longitude: 120.884344,
        latitudeDelta: 0.0022,
        longitudeDelta: 0.0022,
      }}
      onPress={onMapPress}
      showsUserLocation
      showsMyLocationButton
    >
      {markers.map((marker) => (
        <Marker
          key={marker.id}
          coordinate={marker.coordinate}
          title={marker.title}
          description={`Coffee tree at ${farmName}`}
          pinColor="#4CAF50"
        />
      ))}
    </MapView>
  );
}
