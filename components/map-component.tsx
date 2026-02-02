import React from 'react';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

interface MapComponentProps {
  markers: { id: string; coordinate: { latitude: number; longitude: number }; title: string }[];
  onMapPress: (event: any) => void;
  farmName: string;
}

export default function MapComponent({ markers, onMapPress, farmName }: MapComponentProps) {
  const region = {
    latitude: 14.1975602,
    longitude: 120.8843819,
    latitudeDelta: 0.001,
    longitudeDelta: 0.001,
  };

  return (
    <MapView
      provider={PROVIDER_GOOGLE}
      style={{ flex: 1 }}
      mapType="hybrid"
      initialRegion={region}
      region={region}
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
