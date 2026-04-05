import React, { useRef } from 'react';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

interface FarmCardMapProps {
  markers: { id: string; coordinate: { latitude: number; longitude: number }; title: string }[];
  farmName: string;
}

const FARM_REGION = {
  latitude: 14.197607,
  longitude: 120.884344,
  latitudeDelta: 0.00045,
  longitudeDelta: 0.00045,
};

export default function FarmCardMap({ markers, farmName }: FarmCardMapProps) {
  const mapRef = useRef<MapView>(null);

  return (
    <MapView
      ref={mapRef}
      provider={PROVIDER_GOOGLE}
      style={{ flex: 1 }}
      mapType="hybrid"
      scrollEnabled={false}
      zoomEnabled={false}
      pitchEnabled={false}
      rotateEnabled={false}
      initialRegion={FARM_REGION}
      onMapReady={() => {
        mapRef.current?.animateToRegion(FARM_REGION, 300);
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
