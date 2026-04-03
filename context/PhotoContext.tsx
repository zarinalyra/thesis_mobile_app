import React, { createContext, useContext, useState } from 'react';
import { PhotoWithExif } from '@/utils/exif-extractor';

interface PhotoContextType {
  photos: PhotoWithExif[];
  treeDetails: {
    treeId: string;
    treeType: string;
    datePlanted: string;
  };
  addPhoto: (photo: PhotoWithExif) => void;
  setPhotos: (photos: PhotoWithExif[]) => void;
  setTreeDetails: (details: { treeId: string; treeType: string; datePlanted: string }) => void;
  clearPhotos: () => void;
}

const PhotoContext = createContext<PhotoContextType | undefined>(undefined);

export function PhotoProvider({ children }: { children: React.ReactNode }) {
  const [photos, setPhotosState] = useState<PhotoWithExif[]>([]);
  const [treeDetails, setTreeDetailsState] = useState({
    treeId: '',
    treeType: '',
    datePlanted: '',
  });

  const value: PhotoContextType = {
    photos,
    treeDetails,
    addPhoto: (photo) => setPhotosState((prev) => [...prev, photo]),
    setPhotos: setPhotosState,
    setTreeDetails: setTreeDetailsState,
    clearPhotos: () => {
      setPhotosState([]);
      setTreeDetailsState({ treeId: '', treeType: '', datePlanted: '' });
    },
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
