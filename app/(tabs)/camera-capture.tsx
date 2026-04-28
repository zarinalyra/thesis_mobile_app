import { ThemedText } from "@/components/themed-text";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { usePhotos } from "@/context/PhotoContext";
import { PhotoWithExif, extractExifData } from "@/utils/exif-extractor";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState, useEffect } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Crop preview layout constants
const PREVIEW_HEADER_H = 80;
const PREVIEW_BOTTOM_H = 170;

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
interface RawCapture {
  uri: string;
  width: number;
  height: number;
  exifRaw: any;
  locationPromise: Promise<Location.LocationObject | null>;
}

interface DisplayBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// ─────────────────────────────────────────────────────────────
// CROP PREVIEW SCREEN
//
// Phase 1 — "drawing":  no box shown, user drags finger to draw
//                       a rectangle freely over the image.
// Phase 2 — "adjusting": the drawn box appears with corner
//                         handles; user fine-tunes then confirms.
// ─────────────────────────────────────────────────────────────
function CropPreviewScreen({
  rawUri,
  imgW,
  imgH,
  photoNumber,
  thumbnails,
  onConfirm,
  onRetake,
}: {
  rawUri: string;
  imgW: number;
  imgH: number;
  photoNumber: number;
  thumbnails: string[];
  onConfirm: (croppedUri: string) => void;
  onRetake: () => void;
}) {
  // ── Layout math ─────────────────────────────────────────────
  const PREVIEW_W = SCREEN_WIDTH;
  const PREVIEW_H = SCREEN_HEIGHT - PREVIEW_HEADER_H - PREVIEW_BOTTOM_H;

  const containScale = Math.min(PREVIEW_W / imgW, PREVIEW_H / imgH);
  const displayedW = imgW * containScale;
  const displayedH = imgH * containScale;
  const imgOffsetX = (PREVIEW_W - displayedW) / 2;
  const imgOffsetY = (PREVIEW_H - displayedH) / 2;

  const MIN_SIZE = 40;
  const clamp = (v: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, v));

  // ── Phase — drawing → adjusting ─────────────────────────────
  // phaseRef lets PanResponder closures (created once) read the
  // current phase without stale closure issues.
  const phaseRef = useRef<"drawing" | "adjusting">("drawing");
  const [phase, setPhaseSt] = useState<"drawing" | "adjusting">("drawing");
  const setPhase = (p: "drawing" | "adjusting") => {
    phaseRef.current = p;
    setPhaseSt(p);
  };

  // ── Drawing state ────────────────────────────────────────────
  const anchorRef = useRef<{ x: number; y: number } | null>(null);
  const [liveBox, setLiveBox] = useState<DisplayBox | null>(null);

  // ── Adjusting state ──────────────────────────────────────────
  const cropBoxRef = useRef<DisplayBox>({ left: 0, top: 0, right: 0, bottom: 0 });
  const snapshotRef = useRef<DisplayBox | null>(null);
  const [cropBox, setCropBoxState] = useState<DisplayBox>({
    left: 0, top: 0, right: 0, bottom: 0,
  });
  const [confirming, setConfirming] = useState(false);

  const setCropBox = (box: DisplayBox) => {
    cropBoxRef.current = box;
    setCropBoxState(box);
  };

  // ── Drawing PanResponder (image container) ───────────────────
  // Captures the first touch and tracks the drag to build a
  // live rectangle. On release, commits to adjusting phase.
  const drawPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => phaseRef.current === "drawing",
      onMoveShouldSetPanResponder: () => phaseRef.current === "drawing",
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const ax = clamp(locationX, imgOffsetX, imgOffsetX + displayedW);
        const ay = clamp(locationY, imgOffsetY, imgOffsetY + displayedH);
        anchorRef.current = { x: ax, y: ay };
        setLiveBox({ left: ax, top: ay, right: ax, bottom: ay });
      },
      onPanResponderMove: (_, g) => {
        const a = anchorRef.current;
        if (!a) return;
        const curX = clamp(a.x + g.dx, imgOffsetX, imgOffsetX + displayedW);
        const curY = clamp(a.y + g.dy, imgOffsetY, imgOffsetY + displayedH);
        setLiveBox({
          left: Math.min(a.x, curX),
          top: Math.min(a.y, curY),
          right: Math.max(a.x, curX),
          bottom: Math.max(a.y, curY),
        });
      },
      onPanResponderRelease: () => {
        anchorRef.current = null;
        setLiveBox((prev) => {
          if (!prev) return null;
          if (
            prev.right - prev.left > MIN_SIZE &&
            prev.bottom - prev.top > MIN_SIZE
          ) {
            // Commit drawn box and switch to adjusting
            cropBoxRef.current = prev;
            setCropBoxState(prev);
            phaseRef.current = "adjusting";
            setPhaseSt("adjusting");
          }
          return prev;
        });
      },
    }),
  ).current;

  // ── Corner PanResponders (adjusting phase only) ──────────────
  const makePan = (corner: "tl" | "tr" | "bl" | "br") =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        snapshotRef.current = { ...cropBoxRef.current };
      },
      onPanResponderMove: (_, g) => {
        const s = snapshotRef.current;
        if (!s) return;
        const maxR = imgOffsetX + displayedW;
        const maxB = imgOffsetY + displayedH;
        let { left, top, right, bottom } = s;
        if (corner === "tl") {
          left = clamp(s.left + g.dx, imgOffsetX, s.right - MIN_SIZE);
          top = clamp(s.top + g.dy, imgOffsetY, s.bottom - MIN_SIZE);
        } else if (corner === "tr") {
          right = clamp(s.right + g.dx, s.left + MIN_SIZE, maxR);
          top = clamp(s.top + g.dy, imgOffsetY, s.bottom - MIN_SIZE);
        } else if (corner === "bl") {
          left = clamp(s.left + g.dx, imgOffsetX, s.right - MIN_SIZE);
          bottom = clamp(s.bottom + g.dy, s.top + MIN_SIZE, maxB);
        } else {
          right = clamp(s.right + g.dx, s.left + MIN_SIZE, maxR);
          bottom = clamp(s.bottom + g.dy, s.top + MIN_SIZE, maxB);
        }
        setCropBox({ left, top, right, bottom });
      },
    });

  const tlPan = useRef(makePan("tl")).current;
  const trPan = useRef(makePan("tr")).current;
  const blPan = useRef(makePan("bl")).current;
  const brPan = useRef(makePan("br")).current;

  // ── Confirm: convert display box → image pixels → crop ───────
  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const box = cropBoxRef.current;
      const fx = Math.max(0, Math.round((box.left - imgOffsetX) / containScale));
      const fy = Math.max(0, Math.round((box.top - imgOffsetY) / containScale));
      const fw = Math.min(
        Math.round((box.right - box.left) / containScale),
        imgW - fx,
      );
      const fh = Math.min(
        Math.round((box.bottom - box.top) / containScale),
        imgH - fy,
      );

      if (fw > 10 && fh > 10) {
        const cropped = await ImageManipulator.manipulateAsync(
          rawUri,
          [{ crop: { originX: fx, originY: fy, width: fw, height: fh } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
        );
        onConfirm(cropped.uri);
      } else {
        onConfirm(rawUri);
      }
    } catch {
      onConfirm(rawUri);
    } finally {
      setConfirming(false);
    }
  };

  // The box to render: live during drawing, cropBox during adjusting
  const activeBox = phase === "drawing" ? liveBox : cropBox;
  const boxW = activeBox ? activeBox.right - activeBox.left : 0;
  const boxH = activeBox ? activeBox.bottom - activeBox.top : 0;

  // ── Render ───────────────────────────────────────────────────
  return (
    <View style={prev.container}>
      {/* Progress header */}
      <View style={prev.header}>
        <ThemedText style={prev.progressText}>
          Image {photoNumber} of 3
        </ThemedText>
        <ThemedText style={prev.hintText}>
          {phase === "drawing"
            ? "Drag to select crop area"
            : "Drag corners to adjust"}
        </ThemedText>
      </View>

      {/* Image + drawing surface */}
      <View
        style={{ width: PREVIEW_W, height: PREVIEW_H, backgroundColor: "#000" }}
        {...drawPan.panHandlers}
      >
        <Image
          source={{ uri: rawUri }}
          style={{ width: PREVIEW_W, height: PREVIEW_H }}
          resizeMode="contain"
        />

        {activeBox && (
          <>
            {/* Dark mask: 4 regions outside the crop box */}
            <View
              style={[prev.dark, { top: 0, left: 0, right: 0, height: activeBox.top }]}
            />
            <View
              style={[prev.dark, { top: activeBox.bottom, left: 0, right: 0, bottom: 0 }]}
            />
            <View
              style={[prev.dark, { top: activeBox.top, left: 0, width: activeBox.left, height: boxH }]}
            />
            <View
              style={[prev.dark, { top: activeBox.top, left: activeBox.right, right: 0, height: boxH }]}
            />

            {/* Crop border */}
            <View
              style={[
                prev.cropBorder,
                { left: activeBox.left, top: activeBox.top, width: boxW, height: boxH },
              ]}
            />

            {/* Corner handles — adjusting phase only */}
            {phase === "adjusting" && (
              <>
                <View
                  style={[prev.handle, prev.handleTL, { left: activeBox.left - 16, top: activeBox.top - 16 }]}
                  {...tlPan.panHandlers}
                />
                <View
                  style={[prev.handle, prev.handleTR, { left: activeBox.right - 16, top: activeBox.top - 16 }]}
                  {...trPan.panHandlers}
                />
                <View
                  style={[prev.handle, prev.handleBL, { left: activeBox.left - 16, top: activeBox.bottom - 16 }]}
                  {...blPan.panHandlers}
                />
                <View
                  style={[prev.handle, prev.handleBR, { left: activeBox.right - 16, top: activeBox.bottom - 16 }]}
                  {...brPan.panHandlers}
                />
              </>
            )}
          </>
        )}
      </View>

      {/* Bottom bar: thumbnails + buttons */}
      <View style={prev.bottomBar}>
        <View style={prev.thumbnailStrip}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={prev.thumbSlot}>
              {thumbnails[i] ? (
                <Image
                  source={{ uri: thumbnails[i] }}
                  style={prev.thumb}
                  resizeMode="cover"
                />
              ) : (
                <View style={[prev.thumb, prev.thumbEmpty]} />
              )}
            </View>
          ))}
        </View>

        <View style={prev.buttonRow}>
          <Pressable style={prev.retakeBtn} onPress={onRetake}>
            <ThemedText style={prev.retakeBtnText}>Retake</ThemedText>
          </Pressable>
          <Pressable
            style={[
              prev.confirmBtn,
              phase === "drawing" && prev.confirmBtnDisabled,
            ]}
            onPress={phase === "adjusting" ? handleConfirm : undefined}
            disabled={phase === "drawing" || confirming}
          >
            {confirming ? (
              <ActivityIndicator color="#000" />
            ) : (
              <ThemedText style={prev.confirmBtnText}>Confirm</ThemedText>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN CAMERA CAPTURE SCREEN
// ─────────────────────────────────────────────────────────────
export default function CameraCaptureScreen() {
  const { farmId, treeId, treeType, datePlanted, isUpdate } =
    useLocalSearchParams();
  const router = useRouter();
  const { photos, addPhoto, treeDetails } = usePhotos();
  const [permission, requestPermission] = useCameraPermissions();
  const [locationPermission, requestLocationPermission] =
    Location.useForegroundPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const flashAnim = useRef(new Animated.Value(0)).current;

  const [screenMode, setScreenMode] = useState<"camera" | "preview">("camera");
  const [rawCapture, setRawCapture] = useState<RawCapture | null>(null);

  useEffect(() => {
    requestPermission();
    requestLocationPermission();
  }, [requestPermission, requestLocationPermission]);

  const handleBackPress = () => {
    router.push(`/(tabs)/farm-map?farmId=${farmId}`);
  };

  // ── Capture ──────────────────────────────────────────────────
  const handleCapture = async () => {
    if (!cameraRef.current) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      Animated.sequence([
        Animated.timing(flashAnim, {
          toValue: 1,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(flashAnim, {
          toValue: 0,
          duration: 80,
          useNativeDriver: true,
        }),
      ]).start();

      const raw = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        exif: true,
      });

      // Start location fetch in background while user crops
      const locationPromise: Promise<Location.LocationObject | null> =
        locationPermission?.granted
          ? Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            }).catch(() => null)
          : Promise.resolve(null);

      setRawCapture({
        uri: raw.uri,
        width: raw.width,
        height: raw.height,
        exifRaw: raw.exif || {},
        locationPromise,
      });
      setScreenMode("preview");
    } catch (e) {
      console.error("Failed to take photo:", e);
    }
  };

  // ── Confirm crop ─────────────────────────────────────────────
  const handleConfirm = async (croppedUri: string) => {
    if (!rawCapture) return;

    // Collect location — give up to 1.5s more while user was cropping
    let freshLocation: PhotoWithExif["location"] = undefined;
    try {
      const loc = await Promise.race([
        rawCapture.locationPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
      ]);
      if (loc?.coords) {
        freshLocation = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          altitude: loc.coords.altitude ?? undefined,
          accuracy: loc.coords.accuracy ?? undefined,
        };
      }
    } catch {
      /* GPS unavailable — photo proceeds without location */
    }

    const mockPhotoResult = {
      width: rawCapture.width,
      height: rawCapture.height,
      exif: rawCapture.exifRaw,
    };
    const exif = await extractExifData(mockPhotoResult, freshLocation);
    const photo: PhotoWithExif = { uri: croppedUri, exif, location: freshLocation };

    addPhoto(photo);
    setRawCapture(null);

    if (photos.length >= 2) {
      const resolvedTreeId = (
        treeDetails.treeId || String(treeId ?? "")
      ).trim();
      const resolvedTreeType = (
        treeDetails.treeType || String(treeType ?? "")
      ).trim();
      const resolvedDatePlanted = (
        treeDetails.datePlanted || String(datePlanted ?? "")
      ).trim();

      router.push({
        pathname: "/(tabs)/photo-review",
        params: {
          farmId: String(farmId),
          treeId: resolvedTreeId,
          treeType: resolvedTreeType,
          datePlanted: resolvedDatePlanted,
          isUpdate: String(isUpdate ?? "false"),
        },
      });
    } else {
      setScreenMode("camera");
    }
  };

  // ── Retake ───────────────────────────────────────────────────
  const handleRetake = () => {
    setRawCapture(null);
    setScreenMode("camera");
  };

  // ── Permission gate ──────────────────────────────────────────
  if (!permission || !permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <ThemedText style={styles.permissionText}>
          Camera access is required to capture photos.
        </ThemedText>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <ThemedText style={styles.permissionButtonText}>
            Grant Permission
          </ThemedText>
        </Pressable>
      </View>
    );
  }

  // ── Crop preview mode ────────────────────────────────────────
  if (screenMode === "preview" && rawCapture) {
    return (
      <CropPreviewScreen
        key={rawCapture.uri}
        rawUri={rawCapture.uri}
        imgW={rawCapture.width}
        imgH={rawCapture.height}
        photoNumber={photos.length + 1}
        thumbnails={photos.map((p) => p.uri)}
        onConfirm={handleConfirm}
        onRetake={handleRetake}
      />
    );
  }

  // ── Camera mode ──────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={handleBackPress}>
          <IconSymbol name="map" size={24} color="#000" />
        </Pressable>
        <ThemedText style={styles.headerTitle}>
          {isUpdate === "true"
            ? `Update Tree ${treeId}`
            : `Add New Tree to Farm-${farmId}`}
        </ThemedText>
        <View style={styles.spacer} />
      </View>

      {/* Full-screen camera preview — no overlay or ROI box */}
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />

        {/* Counter + shutter */}
        <View style={styles.overlayBottom}>
          <ThemedText style={styles.hintText}>
            Capture one coffee leaf per photo
          </ThemedText>
          <ThemedText style={styles.counterText}>{photos.length}/3</ThemedText>
          <Pressable style={styles.shutterButton} onPress={handleCapture}>
            {({ pressed }) => (
              <View
                style={[
                  styles.shutterInner,
                  pressed && styles.shutterInnerPressed,
                ]}
              />
            )}
          </Pressable>
        </View>

        {/* Flash overlay */}
        <Animated.View
          style={[styles.flashOverlay, { opacity: flashAnim }]}
          pointerEvents="none"
        />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// STYLES — camera screen
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    position: "relative",
  },
  backButton: { paddingLeft: 15 },
  spacer: { width: 24 },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    flex: 1,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  cameraContainer: { flex: 1, position: "relative", backgroundColor: "#000" },
  camera: { flex: 1 },
  overlayBottom: {
    position: "absolute",
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 8,
  },
  hintText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  counterText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  shutterButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  shutterInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
  },
  shutterInnerPressed: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#fff",
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#000",
  },
  permissionText: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 16,
  },
  permissionButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  permissionButtonText: { color: "#000", fontWeight: "600", fontSize: 15 },
});

// ─────────────────────────────────────────────────────────────
// STYLES — crop preview screen
// ─────────────────────────────────────────────────────────────
const prev = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    height: PREVIEW_HEADER_H,
    backgroundColor: "#111",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 30,
    gap: 2,
  },
  progressText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  hintText: { color: "rgba(255,255,255,0.55)", fontSize: 12 },
  dark: { position: "absolute", backgroundColor: "rgba(0,0,0,0.55)" },
  cropBorder: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.5)",
  },
  handle: { position: "absolute", width: 32, height: 32, zIndex: 10 },
  handleTL: { borderTopWidth: 4, borderLeftWidth: 4, borderColor: "#4ADE80" },
  handleTR: { borderTopWidth: 4, borderRightWidth: 4, borderColor: "#4ADE80" },
  handleBL: { borderBottomWidth: 4, borderLeftWidth: 4, borderColor: "#4ADE80" },
  handleBR: { borderBottomWidth: 4, borderRightWidth: 4, borderColor: "#4ADE80" },
  bottomBar: {
    flex: 1,
    backgroundColor: "#111",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    justifyContent: "space-between",
  },
  thumbnailStrip: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    marginBottom: 10,
  },
  thumbSlot: { width: 58, height: 58 },
  thumb: { width: 58, height: 58, borderRadius: 6 },
  thumbEmpty: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  buttonRow: { flexDirection: "row", gap: 12 },
  retakeBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#fff",
    alignItems: "center",
  },
  retakeBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  confirmBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#4ADE80",
    alignItems: "center",
  },
  confirmBtnDisabled: {
    backgroundColor: "#374151",
  },
  confirmBtnText: { color: "#000", fontWeight: "700", fontSize: 16 },
});
