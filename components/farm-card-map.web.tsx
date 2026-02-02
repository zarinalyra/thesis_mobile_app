import React from 'react';
import { View } from 'react-native';

interface FarmCardMapProps {
  markers: { id: string; coordinate: { latitude: number; longitude: number }; title: string }[];
  farmName: string;
}

export default function FarmCardMap({ markers, farmName }: FarmCardMapProps) {
  return (
    <View style={{ flex: 1 }}>
      <iframe
        style={{ width: '100%', height: '100%', border: 0 }}
        src="https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d300!2d120.8843819!3d14.1975602!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e1!3m2!1sen!2sph!4v1234567890"
        allowFullScreen
        loading="lazy"
      />
    </View>
  );
}
