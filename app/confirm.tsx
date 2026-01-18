import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// --- Services (Kept exactly as is) ---
import {
  createIntent,
  createRecording,
  getPresignedUrl,
  matchIntents,
  suggestIntent,
  transcribeFromS3,
} from "../src/services/apiService";
import { playRecording, stopPlayback } from "../src/services/audioService";
import { uploadToPresignedUrl } from "../src/services/s3UploadService";
import {
  getOrCreateDeviceId,
  saveHistoryItem,
} from "../src/services/storageService";
import { makeIntentId } from "../src/utils/intent";
import { ThemeColors, useTheme } from "../src/theme/theme";

// --- Types ---
type Suggestion = {
  intentId: string;
  label: string;
  score: number;
  isAi?: boolean;
};

type PendingRecording = {
  deviceId: string;
  recordingId: string;
  createdAt: string;
  s3Key: string;
  transcript: string;
};

// --- Constants ---
const LOW_SCORE_THRESHOLD = 0.35;
const TOP_K = 3;

function scoreLabel(score: number) {
  if (score >= 0.6) return "High Confidence";
  if (score >= LOW_SCORE_THRESHOLD) return "Medium";
  return "Low Confidence";
}

export default function ConfirmScreen() {
  const insets = useSafeAreaInsets();
  const { colors, mode } = useTheme();
  const styles = useMemo(() => makeStyles(colors, mode), [colors, mode]);
  const primaryTextColor = mode === "dark" ? "#0B1020" : "#F8FAFF";
  const selectedTextColor = mode === "dark" ? "#fff" : colors.text;
  const { uri } = useLocalSearchParams<{ uri?: string }>();
  const safeUri = useMemo(() => (typeof uri === "string" ? uri : null), [uri]);

  // Logic Refs
  const lastAutoUri = useRef<string | null>(null);
  const runIdRef = useRef(0);

  // Animation Refs
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // State
  const [status, setStatus] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingRecording | null>(null);

  // --- Animations ---
  useEffect(() => {
    if (isWorking || isPlaying) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.6,
            duration: 800,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
        ]),
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isWorking, isPlaying]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  // --- Handlers ---

  const onPlay = async () => {
    if (!safeUri) return;
    setIsPlaying(true);
    await playRecording(safeUri);
    // Simple timeout to reset play state since we don't have an event listener in this snippet
    // In a real app, use the sound object's status update
    setTimeout(() => setIsPlaying(false), 3000);
  };

  const onStop = async () => {
    await stopPlayback();
    setIsPlaying(false);
  };

  function resetUiForRun() {
    setStatus(null);
    setSuggestions([]);
    setSelectedId(null);
    setPending(null);
    setHasRun(false);
  }

  const runPipeline = async () => {
    if (!safeUri) return;
    const myRunId = ++runIdRef.current;
    setIsWorking(true);
    resetUiForRun();

    // Helper closures to ensure we only update if this is the active run
    const ifActive = (fn: () => void) => {
      if (runIdRef.current === myRunId) fn();
    };

    try {
      const deviceId = await getOrCreateDeviceId();
      const recordingId = `${Date.now()}`;
      const createdAt = new Date().toISOString();

      ifActive(() => setStatus("Uploading..."));
      const { uploadUrl, key } = await getPresignedUrl(deviceId);
      await uploadToPresignedUrl(uploadUrl, safeUri);

      ifActive(() => setStatus("Transcribing..."));
      const tRes = await transcribeFromS3(deviceId, key);
      const transcript = (tRes.transcript || "").trim();
      if (!transcript) throw new Error("No transcript returned.");

      ifActive(() => setStatus("Analyzing..."));
      const matchRes = await matchIntents(deviceId, transcript, TOP_K);
      const matched = (matchRes.suggestions || []).filter(
        (s) => typeof s.score === "number" && !!s.label && !!s.intentId,
      );

      const needsAi =
        matched.length === 0 ||
        matched.every((s) => s.score < LOW_SCORE_THRESHOLD);

      if (needsAi) {
        ifActive(() => setStatus("Generating AI suggestion..."));
        const aiRes = await suggestIntent(transcript);
        const label = (aiRes?.suggestion?.label || "").trim();
        if (!label) throw new Error("AI returned empty.");

        const aiIntentId = `ai-suggestion-${Date.now()}`;
        ifActive(() => {
          setSuggestions([
            { intentId: aiIntentId, label, score: 0, isAi: true },
          ]);
          setSelectedId(aiIntentId);
        });
      } else {
        ifActive(() => {
          setSuggestions(matched);
          setSelectedId(matched[0]?.intentId ?? null);
        });
      }

      ifActive(() => {
        setPending({
          deviceId,
          recordingId,
          createdAt,
          s3Key: key,
          transcript,
        });
        setHasRun(true);
        setStatus(null);
      });
    } catch (e: any) {
      ifActive(() => setStatus("Error: " + e.message));
    } finally {
      ifActive(() => setIsWorking(false));
    }
  };

  const onGenerateSuggestions = async () => {
    try {
      await runPipeline();
    } catch (e: any) {
      Alert.alert("Error", e.message);
      setIsWorking(false);
    }
  };

  const onConfirm = async () => {
    if (!pending || !selectedId || !safeUri) return;
    const selected = suggestions.find((s) => s.intentId === selectedId);
    if (!selected) return;

    try {
      setIsWorking(true);
      setStatus("Saving...");

      let finalId = selected.intentId;
      let finalLabel = selected.label;

      if (selected.isAi) {
        const newId = makeIntentId(selected.label);
        const existing = suggestions.find(
          (s) => !s.isAi && makeIntentId(s.label) === newId,
        );
        if (existing) {
          finalId = existing.intentId;
          finalLabel = existing.label;
        } else {
          await createIntent(pending.deviceId, newId, selected.label);
          finalId = newId;
        }
      }

      await saveHistoryItem({
        id: pending.recordingId,
        createdAt: pending.createdAt,
        audioUri: safeUri,
        intentId: finalId,
        intentLabel: finalLabel,
        s3Key: pending.s3Key,
      });

      await createRecording({
        deviceId: pending.deviceId,
        recordingId: pending.recordingId,
        s3Key: pending.s3Key,
        confirmedIntent: finalLabel,
        createdAt: pending.createdAt,
        transcript: pending.transcript,
      });

      setStatus("Done!");
      router.replace("/(tabs)/history");
    } catch (e: any) {
      Alert.alert("Failed", e.message);
      setStatus(null);
    } finally {
      setIsWorking(false);
    }
  };

  const onAddFromTranscript = async () => {
    if (!pending) return;
    const label = pending.transcript.trim();
    if (!label) return Alert.alert("Empty", "No transcript available.");

    setIsWorking(true);
    setStatus("Adding...");
    try {
      const intentId = makeIntentId(label);
      await createIntent(pending.deviceId, intentId, label);
      setSuggestions([{ intentId, label, score: 1 }]);
      setSelectedId(intentId);
      setStatus(null);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setIsWorking(false);
    }
  };

  useEffect(() => {
    if (safeUri && lastAutoUri.current !== safeUri) {
      lastAutoUri.current = safeUri;
      onGenerateSuggestions();
    }
  }, [safeUri]);

  const canConfirm = !!pending && !!selectedId && !isWorking;

  return (
    <LinearGradient
      colors={colors.background}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      {/* Background Atmosphere */}
      <View style={styles.atmosphere}>
        <Animated.View
          style={[
            styles.meshA,
            { opacity: fadeAnim, transform: [{ scale: fadeAnim }] },
          ]}
        />
        <View style={styles.meshB} />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Review</Text>
        <View style={styles.secureBadge}>
          <Ionicons name="lock-closed" size={12} color={colors.success} />
          <Text style={styles.secureText}>Secure</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 140, paddingHorizontal: 20 }}
      >
        {/* Audio Player Card */}
        <View style={styles.glassPanel}>
          <View style={styles.playerRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="mic" size={18} color={colors.accent} />
            </View>
            <View style={styles.playerInfo}>
              <Text style={styles.playerLabel}>New Recording</Text>
              <Text style={styles.playerSub}>Tap to play audio</Text>
            </View>
            <Pressable
              onPress={isPlaying ? onStop : onPlay}
              style={styles.playBtn}
              disabled={isWorking}
            >
              <Ionicons
                name={isPlaying ? "stop" : "play"}
                size={18}
                color={primaryTextColor}
              />
            </Pressable>
          </View>
        </View>

        {/* Dynamic Status / Action Area */}
        <View style={styles.statusArea}>
          {isWorking ? (
            <View style={styles.workingState}>
              <Animated.View style={{ opacity: pulseAnim }}>
                <Ionicons name="sparkles" size={24} color={colors.accent} />
              </Animated.View>
              <Text style={styles.workingText}>
                {status || "Processing..."}
              </Text>
            </View>
          ) : (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Matched Intent</Text>
              {hasRun && pending && (
                <Pressable onPress={onGenerateSuggestions}>
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>

        {/* Suggestions List */}
        <View style={styles.listContainer}>
          {suggestions.length > 0 ? (
            suggestions.map((s) => {
              const isSelected = s.intentId === selectedId;
              return (
                <Pressable
                  key={s.intentId}
                  onPress={() => setSelectedId(s.intentId)}
                  style={[
                    styles.suggestionCard,
                    isSelected && styles.suggestionSelected,
                  ]}
                >
                  <View style={styles.suggestionRow}>
                    <View
                      style={[styles.radio, isSelected && styles.radioActive]}
                    >
                      {isSelected && <View style={styles.radioDot} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.intentLabel,
                          isSelected && { color: selectedTextColor },
                        ]}
                      >
                        {s.label}
                      </Text>
                      <View style={styles.metaRow}>
                        {s.isAi && (
                          <LinearGradient
                            colors={["#B79BFF", "#8F72FF"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.aiBadge}
                          >
                            <Ionicons name="sparkles" size={10} color={colors.text} />
                            <Text style={styles.aiBadgeText}>AI Generated</Text>
                          </LinearGradient>
                        )}
                        <Text style={styles.confidenceText}>
                          {scoreLabel(s.score)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              );
            })
          ) : !isWorking && hasRun ? (
            // Empty State / No Match
            <View style={styles.emptyState}>
              <Ionicons
                name="help-buoy-outline"
                size={32}
                color="rgba(255,255,255,0.3)"
              />
              <Text style={styles.emptyText}>No good match found.</Text>
              <Pressable
                onPress={onAddFromTranscript}
                style={styles.secondaryAction}
              >
                <Text style={styles.secondaryActionText}>
                  Use Transcript as Intent
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Floating Bottom Bar */}
      <View
        style={[
          styles.bottomBar,
          { paddingBottom: Math.max(insets.bottom, 20) },
        ]}
      >
        <Pressable
          disabled={!canConfirm}
          onPress={onConfirm}
          style={[styles.confirmBtn, !canConfirm && styles.confirmDisabled]}
        >
          <LinearGradient
            colors={
              canConfirm
                ? ["#E6EFFF", "#C9DCFF"]
                : ["rgba(255,255,255,0.1)", "rgba(255,255,255,0.05)"]
            }
            style={styles.confirmGradient}
          >
            {isWorking ? (
              <Text style={[styles.confirmText, { color: colors.textDim }]}>
                Saving...
              </Text>
            ) : (
              <>
                <Ionicons
                  name="checkmark"
                  size={20}
                  color={canConfirm ? primaryTextColor : colors.textDim}
                />
                <Text
                  style={[
                    styles.confirmText,
                    !canConfirm && { color: colors.textDim },
                  ]}
                >
                  Confirm Intent
                </Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const makeStyles = (colors: ThemeColors, mode: "light" | "dark") => {
  const meshA =
    mode === "dark" ? "rgba(143,208,255,0.18)" : "rgba(47,111,237,0.16)";
  const meshB =
    mode === "dark" ? "rgba(255,107,107,0.12)" : "rgba(228,90,90,0.12)";
  const meshC =
    mode === "dark" ? "rgba(128,152,255,0.12)" : "rgba(120,140,200,0.14)";
  const cardBg = colors.surface;
  const glassFill =
    mode === "dark" ? "rgba(16, 22, 44, 0.4)" : "rgba(255,255,255,0.8)";
  const activeFill =
    mode === "dark" ? "rgba(143, 208, 255, 0.1)" : "rgba(47,111,237,0.12)";
  const radioFill =
    mode === "dark" ? "rgba(143,208,255,0.9)" : "rgba(47,111,237,0.9)";
  const emptyFill =
    mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(11,16,32,0.04)";
  const iconFill =
    mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(11,16,32,0.06)";
  const actionFill =
    mode === "dark" ? "rgba(255,255,255,0.05)" : "rgba(11,16,32,0.04)";
  const accentTint =
    mode === "dark" ? "rgba(143,208,255,0.12)" : "rgba(47,111,237,0.12)";
  const accentBorder =
    mode === "dark" ? "rgba(143,208,255,0.28)" : "rgba(47,111,237,0.24)";
  const aiBg =
    mode === "dark" ? "rgba(183,155,255,0.12)" : "rgba(160,130,255,0.12)";
  const aiBorder =
    mode === "dark" ? "rgba(183,155,255,0.28)" : "rgba(160,130,255,0.26)";

  return StyleSheet.create({
  container: { flex: 1 },

  // Atmosphere
  atmosphere: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  meshA: {
    position: "absolute",
    top: -100,
    right: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: meshA,
  },
  meshB: {
    position: "absolute",
    bottom: 100,
    left: -100,
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: meshB,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginBottom: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: actionFill,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: 0.5,
  },
  secureBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor:
      mode === "dark" ? "rgba(166,255,201,0.1)" : "rgba(20,128,74,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor:
      mode === "dark" ? "rgba(166,255,201,0.2)" : "rgba(20,128,74,0.2)",
  },
  secureText: { fontSize: 10, fontWeight: "700", color: colors.success },

  // Player
  glassPanel: {
    backgroundColor: glassFill,
    borderWidth: 1,
    borderColor: colors.softLine,
    borderRadius: 24,
    padding: 16,
    marginBottom: 24,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: accentTint,
    alignItems: "center",
    justifyContent: "center",
  },
  playerInfo: { flex: 1 },
  playerLabel: { color: colors.text, fontSize: 15, fontWeight: "700" },
  playerSub: { color: colors.textDim, fontSize: 12 },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },

  // Status & List
  statusArea: { minHeight: 40, justifyContent: "center", marginBottom: 12 },
  workingState: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  workingText: { color: colors.accent, fontSize: 14, fontWeight: "600" },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    color: colors.textDim,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "700",
  },
  retryText: { color: colors.accent, fontSize: 13 },

  listContainer: { gap: 10 },
  suggestionCard: {
    backgroundColor: actionFill,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.softLine,
  },
  suggestionSelected: {
    backgroundColor: activeFill,
    borderColor: accentBorder,
  },
  suggestionRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor:
      mode === "dark" ? "rgba(255,255,255,0.3)" : "rgba(11,16,32,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { borderColor: colors.accent },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
  intentLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 4,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  confidenceText: { fontSize: 11, color: colors.textDim },
  aiBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: aiBg,
  },
  aiBadgeText: { fontSize: 10, fontWeight: "800", color: colors.text },

  emptyState: { alignItems: "center", padding: 20, gap: 10 },
  emptyText: { color: colors.textDim },
  secondaryAction: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: actionFill,
    borderRadius: 8,
  },
  secondaryActionText: { color: colors.text, fontSize: 12, fontWeight: "600" },

  // Bottom Bar
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  confirmBtn: {
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  confirmGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  confirmDisabled: { opacity: 0.8 },
  confirmText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0B1020",
  },
  });
};
