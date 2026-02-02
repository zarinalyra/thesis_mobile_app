import React from 'react';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

interface FarmCardMapProps {
  markers: { id: string; coordinate: { latitude: number; longitude: number }; title: string }[];
  farmName: string;
}

export default function FarmCardMap({ markers, farmName }: FarmCardMapProps) {
  return (
    <MapView
      provider={PROVIDER_GOOGLE}
      style={{ flex: 1 }}
      mapType="hybrid"
      scrollEnabled={false}
      zoomEnabled={false}
      pitchEnabled={false}
      rotateEnabled={false}
      initialRegion={{
        latitude: 14.1975602,
        longitude: 120.8843819,
        latitudeDelta: 0.0005,
        longitudeDelta: 0.0005,
      }}
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
