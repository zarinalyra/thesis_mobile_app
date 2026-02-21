import * as FileSystem from 'expo-file-system/legacy';

export interface ExifData {
  latitude?: number;
  longitude?: number;
  altitude?: number;
  accuracy?: number;
  timestamp?: string;
  make?: string;
  model?: string;
  orientation?: number;
  width?: number;
  height?: number;
}

export interface PhotoWithExif {
  uri: string;
  exif: ExifData;
  location?: { latitude: number; longitude: number; altitude?: number; accuracy?: number };
}

export async function extractExifData(
  photoResult: any,
  freshLocation?: { latitude: number; longitude: number; altitude?: number; accuracy?: number }
): Promise<ExifData> {
  const exif: ExifData = {
    timestamp: new Date().toISOString(),
    width: photoResult.width,
    height: photoResult.height,
  };

  if (photoResult.exif) {
    const e = photoResult.exif;
    // Use fresh device location first, fall back to EXIF only if unavailable
    exif.latitude = freshLocation?.latitude ?? e.GPSLatitude;
    exif.longitude = freshLocation?.longitude ?? e.GPSLongitude;
    exif.altitude = freshLocation?.altitude ?? e.GPSAltitude;
    exif.accuracy = freshLocation?.accuracy;
    exif.make = e.Make;
    exif.model = e.Model;
    exif.orientation = e.Orientation;
  }

  return exif;
}

function averageExifData(photos: PhotoWithExif[]): {
  latitude: number;
  longitude: number;
  altitude: number | null;
  timestamp: string;
  rawExif: any;
} {
  if (photos.length === 0) {
    throw new Error('No photos to average');
  }

  const ACCURACY_THRESHOLD_METERS = 15;
  let latSum = 0, lonSum = 0, altSum = 0, altCount = 0, validCount = 0;
  const make = photos[0].exif.make;
  const model = photos[0].exif.model;
  const firstTimestamp = photos[0].exif.timestamp || new Date().toISOString();

  for (const photo of photos) {
    // Filter by accuracy if available
    if (photo.exif.accuracy && photo.exif.accuracy > ACCURACY_THRESHOLD_METERS) {
      console.warn(`Skipping photo — GPS accuracy too low: ${photo.exif.accuracy}m`);
      continue;
    }

    const lat = photo.exif.latitude ?? photo.location?.latitude;
    const lon = photo.exif.longitude ?? photo.location?.longitude;
    
    // Skip invalid coordinates
    if (lat == null || lon == null || (lat === 0 && lon === 0)) {
      console.warn('Skipping photo with missing/invalid coordinates');
      continue;
    }
    
    latSum += lat;
    lonSum += lon;
    validCount++;
    
    const alt = photo.exif.altitude ?? photo.location?.altitude;
    if (alt != null) {
      altSum += alt;
      altCount++;
    }
  }

  if (validCount === 0) {
    throw new Error('No photos with valid GPS coordinates');
  }

  const avgLatitude = latSum / validCount;
  const avgLongitude = lonSum / validCount;
  const avgAltitude = altCount > 0 ? altSum / altCount : null;

  return {
    latitude: avgLatitude,
    longitude: avgLongitude,
    altitude: avgAltitude,
    timestamp: firstTimestamp,
    rawExif: {
      photoCount: photos.length,
      validPhotoCount: validCount,
      make: make,
      model: model,
      avgWidth: Math.round(photos.reduce((sum, p) => sum + (p.exif.width || 0), 0) / photos.length),
      avgHeight: Math.round(photos.reduce((sum, p) => sum + (p.exif.height || 0), 0) / photos.length),
    },
  };
}

export async function uploadPhotosToSupabase(
  supabase: any,
  photos: PhotoWithExif[],
  farmId: string,
  hasDisease: boolean = false
) {
  const uploadedFiles: string[] = [];
  try {
    console.log('=== BATCH UPLOAD START ===');
    console.log('Uploading', photos.length, 'photos for farm', farmId);

    if (photos.length === 0) {
      throw new Error('No photos to upload');
    }

    // Step 1: Upload all images to storage
    console.log('Step 1: Uploading images to storage...');
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      console.log(`  [${i + 1}/${photos.length}] Reading file...`);
      
      const fileBase64 = await FileSystem.readAsStringAsync(photo.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (!fileBase64) {
        throw new Error(`Failed to read image ${i + 1} - no base64 data`);
      }

      const binary = atob(fileBase64);
      const bytes = new Uint8Array(binary.length);
      for (let j = 0; j < binary.length; j++) {
        bytes[j] = binary.charCodeAt(j);
      }

      const fileName = `photo_${Date.now()}_${i}.jpg`;
      const filePath = `uploads/${farmId}/${fileName}`;

      console.log(`  [${i + 1}/${photos.length}] Uploading to Supabase...`);
      const { error: uploadError } = await supabase.storage
        .from('leafImages')
        .upload(filePath, bytes, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Storage upload error for image ${i + 1}: ${uploadError.message}`);
      }

      uploadedFiles.push(filePath);
      console.log(`  [${i + 1}/${photos.length}] ✓ Uploaded`);
    }

    // Step 2: Insert image records
    console.log('Step 2: Inserting image records...');
    const imageIds = [];
    for (let i = 0; i < uploadedFiles.length; i++) {
      const { data: imageData, error: imageError } = await supabase
        .from('images')
        .insert({ file_path: uploadedFiles[i] })
        .select()
        .single();

      if (imageError) {
        throw new Error(`Image insert error: ${imageError.message}`);
      }

      imageIds.push(imageData.id);
    }
    console.log('Step 2: ✓ All image records created');

    // Step 3: Calculate averaged EXIF
    console.log('Step 3: Calculating averaged EXIF data...');
    const avgData = averageExifData(photos);
    console.log('Averaged location:', { lat: avgData.latitude, lon: avgData.longitude, alt: avgData.altitude });

    // Step 4: Insert ONE averaged geotag record
    console.log('Step 4: Inserting averaged geotag...');
    const { data: geotagData, error: geotagError } = await supabase
      .from('geotags')
      .insert({
        latitude: avgData.latitude,
        longitude: avgData.longitude,
        altitude: avgData.altitude,
        location: `SRID=4326;POINT(${avgData.longitude} ${avgData.latitude})`,
        captured_at: avgData.timestamp,
        farm_id: farmId,
        raw_exif: {
          ...avgData.rawExif,
          farmId: farmId,
          hasDisease: hasDisease,
        },
      })
      .select()
      .single();

    if (geotagError) {
      throw new Error(`Geotag insert error: ${geotagError.message}`);
    }

    console.log('✅ Batch upload successful!');
    console.log('=== BATCH UPLOAD END ===');
    return geotagData;
  } catch (error) {
    // Rollback uploaded files on failure
    console.warn('Upload failed, rolling back...');
    for (const filePath of uploadedFiles) {
      await supabase.storage.from('leafImages').remove([filePath]);
    }
    console.error('❌ Batch upload failed:', error);
    throw error;
  }
}

export async function uploadImageToSupabase(
  supabase: any,
  uri: string,
  farmId: string,
  exifData: ExifData,
  location?: { latitude: number; longitude: number; altitude?: number }
) {
  try {
    console.log('=== UPLOAD START ===');
    console.log('1. URI:', uri);
    console.log('2. Farm ID:', farmId);
    console.log('3. EXIF Data:', exifData);
    console.log('4. Location:', location);
    
    if (!uri) {
      throw new Error('No URI provided to uploadImageToSupabase');
    }

    // Read image as base64 from file system
    console.log('95. Reading file from file system...');
    let fileBase64;
    try {
      fileBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch (readError) {
      console.error('ERROR reading file:', readError);
      throw new Error(`Failed to read image file: ${readError}`);
    }

    if (!fileBase64) {
      throw new Error('Failed to read image file - no base64 data returned');
    }
    
    console.log('6. Successfully read base64, length:', fileBase64.length);

    // Convert base64 to Uint8Array for Supabase storage
    console.log('7. Converting base64 to Uint8Array...');
    const binary = atob(fileBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    console.log('8. Uint8Array created, size:', bytes.length);

    // Upload to Supabase Storage bucket
    const fileName = `photo_${Date.now()}.jpg`;
    const filePath = `uploads/${fileName}`;
    
    console.log('9. Uploading to Supabase storage:', filePath);
    const { error: uploadError } = await supabase.storage
      .from('leafImages')
      .upload(filePath, bytes, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw new Error(`Storage upload error: ${uploadError.message}`);
    }
    
    console.log('10. Upload successful, inserting into images table...');

    // Insert row into images table
    const { data: imageData, error: imageError } = await supabase
      .from('images')
      .insert({ file_path: filePath })
      .select()
      .single();

    if (imageError) {
      console.error('Image insert error:', imageError);
      throw new Error(`Image row insert error: ${imageError.message}`);
    }
    
    console.log('11. Image record created, ID:', imageData?.id);

    // Use EXIF GPS or fallback to device location if available
    let lat = exifData.latitude ?? null;
    let lon = exifData.longitude ?? null;
    let alt = exifData.altitude ?? null;
    
    // Fallback to captured device location if EXIF GPS unavailable
    if (!lat || !lon) {
      if (location) {
        console.log('12. Using device location fallback:', location);
        lat = location.latitude;
        lon = location.longitude;
        alt = location.altitude ?? alt;
      }
    }

    // Parse date — expo-camera gives it as "YYYY:MM:DD HH:MM:SS"
    let capturedAt = exifData.timestamp;
    if (exifData.timestamp && exifData.timestamp.includes(':')) {
      const fixed = exifData.timestamp.replace(
        /^(\d{4}):(\d{2}):(\d{2})/,
        '$1-$2-$3'
      );
      capturedAt = new Date(fixed).toISOString();
    }
    
    console.log('13. Final coords - lat:', lat, 'lon:', lon, 'alt:', alt);

    const { data: geotagData, error: geotagError } = await supabase
      .from('geotags')
      .insert({
        image_id: imageData.id,
        latitude: lat ?? 0,
        longitude: lon ?? 0,
        altitude: alt,
        location: lat && lon ? `SRID=4326;POINT(${lon} ${lat})` : null,
        captured_at: capturedAt,
        raw_exif: {
          make: exifData.make,
          model: exifData.model,
          orientation: exifData.orientation,
          width: exifData.width,
          height: exifData.height,
          farmId: farmId,
        },
      })
      .select()
      .single();

    if (geotagError) {
      console.error('Geotag insert error:', geotagError);
      throw new Error(`Geotag insert error: ${geotagError.message}`);
    }

    console.log('✅ Image and EXIF saved successfully!');
    console.log('=== UPLOAD END ===');
    return { image: imageData, geotag: geotagData };
  } catch (error) {
    console.error('❌ Upload failed:', error);
    throw error;
  }
}
