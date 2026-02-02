import React from 'react';
import { View } from 'react-native';

interface MapViewWebProps {
  markers: { id: string; coordinate: { latitude: number; longitude: number }; title: string }[];
  onMapPress: (event: any) => void;
  farmName: string;
}

export default function MapViewWeb({ markers, onMapPress, farmName }: MapViewWebProps) {
  return (
    <View style={{ flex: 1 }}>
      <iframe
        style={{ width: '100%', height: '100%', border: 0 }}
        src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d246381.97403597312!2d120.81260785!3d14.5995472!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3397ca0e12d1d73f%3A0x3b00a85d90cf5c99!2sManila%2C%20Metro%20Manila%2C%20Philippines!5e0!3m2!1sen!2sus!4v1234567890"
        allowFullScreen
        loading="lazy"
      />
    </View>
  );
}
