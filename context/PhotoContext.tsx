import React, { createContext, useContext, useState } from 'react';
import { PhotoWithExif } from '@/utils/exif-extractor';

interface PhotoContextType {
  photos: PhotoWithExif[];
  addPhoto: (photo: PhotoWithExif) => void;
  setPhotos: (photos: PhotoWithExif[]) => void;
  clearPhotos: () => void;
}

const PhotoContext = createContext<PhotoContextType | undefined>(undefined);

export function PhotoProvider({ children }: { children: React.ReactNode }) {
  const [photos, setPhotosState] = useState<PhotoWithExif[]>([]);

  const value: PhotoContextType = {
    photos,
    addPhoto: (photo) => setPhotosState((prev) => [...prev, photo]),
    setPhotos: setPhotosState,
    clearPhotos: () => setPhotosState([]),
  };

  return (
    <PhotoContext.Provider value={value}>
      {children}
    </PhotoContext.Provider>
  );
}

export function usePhotos() {
  const context = useContext(PhotoContext);
  if (!context) {
    throw new Error('usePhotos must be used within PhotoProvider');
  }
  return context;
}
