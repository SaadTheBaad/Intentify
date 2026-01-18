import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
    createIntent,
    createRecording,
    getPresignedUrl,
    matchIntents,
    suggestIntent,
    transcribeFromS3,
} from "../src/services/apiService";
import { playRecording, stopPlayback } from "../src/services/audioService";
import { useTheme } from "../src/context/ThemeContext";
import { uploadToPresignedUrl } from "../src/services/s3UploadService";
import { getOrCreateDeviceId, saveHistoryItem } from "../src/services/storageService";
import { makeIntentId } from "../src/utils/intent";

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

const LOW_SCORE_THRESHOLD = 0.35;
const TOP_K = 3;

function scoreLabel(score: number) {
  if (score >= 0.6) return "High";
  if (score >= LOW_SCORE_THRESHOLD) return "Medium";
  return "Low";
}

/**
 * confirm.tsx
 *
 * This screen runs the full "Intentify pipeline" when it receives an audio `uri`:
 * 1) presign PUT
 * 2) upload audio to S3
 * 3) transcribe from S3
 * 4) match transcript against saved intents (embeddings + cosine)
 * 5) if no match / low confidence -> request AI "suggest intent"
 * 6) user confirms intent; optionally creates new intent; saves recording + local history
 */
export default function ConfirmScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const { uri } = useLocalSearchParams<{ uri?: string }>();
  const safeUri = useMemo(() => (typeof uri === "string" ? uri : null), [uri]);

  // Prevent re-running the pipeline if the screen re-renders with the same URI.
  const lastAutoUri = useRef<string | null>(null);

  // Guard against state updates from stale async runs (e.g., user navigates away).
  const runIdRef = useRef(0);

  const [status, setStatus] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [pending, setPending] = useState<PendingRecording | null>(null);

  const [pipelineStep, setPipelineStep] = useState(0); // 0: upload, 1: transcribe, 2: match, 3: suggest
  const progress = useSharedValue(0);

  useEffect(() => {
    if (isWorking && !pending) {
      progress.value = withSpring((pipelineStep + 1) / 4, {
        damping: 20,
        stiffness: 100,
      });
    } else {
      progress.value = 0;
    }
  }, [pipelineStep, isWorking, pending]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const onPlay = async () => {
    if (!safeUri) return;
    await playRecording(safeUri);
  };

  const onStop = async () => {
    await stopPlayback();
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

    const setStatusSafe = (msg: string) => {
      if (runIdRef.current === myRunId) setStatus(msg);
    };
    const setSuggestionsSafe = (next: Suggestion[]) => {
      if (runIdRef.current === myRunId) setSuggestions(next);
    };
    const setSelectedSafe = (id: string | null) => {
      if (runIdRef.current === myRunId) setSelectedId(id);
    };
    const setPendingSafe = (p: PendingRecording | null) => {
      if (runIdRef.current === myRunId) setPending(p);
    };
    const setHasRunSafe = (v: boolean) => {
      if (runIdRef.current === myRunId) setHasRun(v);
    };

    try {
      setPipelineStep(0);
      const deviceId = await getOrCreateDeviceId();
      const recordingId = `${Date.now()}`;
      const createdAt = new Date().toISOString();

      setStatusSafe("Getting upload URL…");
      const { uploadUrl, key } = await getPresignedUrl(deviceId);

      setStatusSafe("Uploading audio…");
      await uploadToPresignedUrl(uploadUrl, safeUri);

      setPipelineStep(1);
      setStatusSafe("Transcribing…");
      const tRes = await transcribeFromS3(deviceId, key);
      const transcript = (tRes.transcript || "").trim();

      if (!transcript) {
        throw new Error("No transcript returned (try recording again).");
      }

      setPipelineStep(2);
      setStatusSafe("Finding best intent…");
      const matchRes = await matchIntents(deviceId, transcript, TOP_K);
      const matched = (matchRes.suggestions || []).filter(
        (s) => typeof s.score === "number" && !!s.label && !!s.intentId
      );

      const needsAiSuggestion =
        matched.length === 0 || matched.every((s) => s.score < LOW_SCORE_THRESHOLD);

      if (needsAiSuggestion) {
        setPipelineStep(3);
        setStatusSafe("Generating AI suggestion…");
        const aiRes = await suggestIntent(transcript);

        const label = (aiRes?.suggestion?.label || "").trim();
        if (!label) {
          throw new Error("AI returned an empty suggestion.");
        }

        const aiIntentId = `ai-suggestion-${Date.now()}`;
        const aiSuggestions: Suggestion[] = [
          { intentId: aiIntentId, label, score: 0, isAi: true },
        ];

        setSuggestionsSafe(aiSuggestions);
        setSelectedSafe(aiIntentId);
      } else {
        setSuggestionsSafe(matched);
        setSelectedSafe(matched[0]?.intentId ?? null);
      }

      setPendingSafe({
        deviceId,
        recordingId,
        createdAt,
        s3Key: key,
        transcript,
      });

      setHasRunSafe(true);
      setStatusSafe(
        needsAiSuggestion
          ? "AI suggested an intent for you. Review and Confirm!"
          : "Pick the best match, then Confirm!"
      );
    } finally {
      // Only end "working" state if this is still the latest run.
      if (runIdRef.current === myRunId) setIsWorking(false);
    }
  };

  const onGenerateSuggestions = async () => {
    try {
      await runPipeline();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Unknown error");
      // Keep UI in a known state after errors.
      setStatus(null);
      setPending(null);
      setSuggestions([]);
      setSelectedId(null);
      setHasRun(true);
      setIsWorking(false);
    }
  };

  /**
   * Confirmation rules:
   * - If user picked AI suggestion: create new intent first (dedupe by normalized ID).
   * - Save local history for UX.
   * - Save recording metadata to DynamoDB.
   */
  const onConfirm = async () => {
    if (!pending || !selectedId || !safeUri) return;

    const selected = suggestions.find((s) => s.intentId === selectedId);
    if (!selected) return;

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsWorking(true);
      setStatus("Saving…");

      let finalIntentId = selected.intentId;
      let finalIntentLabel = selected.label;

      if (selected.isAi) {
        // Turn the AI label into a stable intentId, so future matches are consistent.
        const newIntentId = makeIntentId(selected.label);

        // Deduplicate: if the same label already exists as a real intent, reuse it.
        // NOTE: This only dedupes against *current* suggestions list.
        const existing = suggestions.find(
          (s) => !s.isAi && makeIntentId(s.label) === newIntentId
        );

        if (existing) {
          finalIntentId = existing.intentId;
          finalIntentLabel = existing.label;
        } else {
          setStatus("Adding AI-suggested intent…");
          await createIntent(pending.deviceId, newIntentId, selected.label);
          finalIntentId = newIntentId;
        }
      }

      // Local UX history (fast + works offline)
      await saveHistoryItem({
        id: pending.recordingId,
        createdAt: pending.createdAt,
        audioUri: safeUri,
        intentId: finalIntentId,
        intentLabel: finalIntentLabel,
        s3Key: pending.s3Key,
      });

      // Backend record (source of truth)
      await createRecording({
        deviceId: pending.deviceId,
        recordingId: pending.recordingId,
        s3Key: pending.s3Key,
        confirmedIntent: finalIntentLabel,
        createdAt: pending.createdAt,
        transcript: pending.transcript,
      });

      setStatus("Done!");
      router.replace("/(tabs)/history");
    } catch (e: any) {
      Alert.alert("Confirm failed", e?.message ?? "Unknown error");
      setStatus(null);
    } finally {
      setIsWorking(false);
    }
  };

  const onAddFromTranscript = async () => {
    if (!pending) return;

    const label = pending.transcript.trim();
    if (!label) {
      Alert.alert("No transcript", "Record again to generate a transcript.");
      return;
    }

    try {
      setIsWorking(true);
      setStatus("Adding intent…");

      const intentId = makeIntentId(label);
      await createIntent(pending.deviceId, intentId, label);

      const next: Suggestion[] = [{ intentId, label, score: 1 }];
      setSuggestions(next);
      setSelectedId(intentId);

      setStatus("Intent added. Review and Confirm!");
    } catch (e: any) {
      Alert.alert("Add failed", e?.message ?? "Unknown error");
      setStatus(null);
    } finally {
      setIsWorking(false);
    }
  };

  const canGenerate = !!safeUri && !isWorking;
  const canConfirm = !!pending && !!selectedId && !isWorking;

  useEffect(() => {
    if (!safeUri) return;
    if (lastAutoUri.current === safeUri) return;

    lastAutoUri.current = safeUri;
    onGenerateSuggestions();
  }, [safeUri]);

  return (
    <LinearGradient
      colors={colors.bgGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.container,
        {
          paddingTop: insets.top + 14,
          paddingBottom: Math.max(insets.bottom, 18) + 18,
        },
      ]}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              { backgroundColor: colors.iconBg, borderColor: colors.iconBorder },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="chevron-back" size={24} color={isDark ? "#D7E3FF" : "#2D5BD8"} />
          </Pressable>

          <View style={styles.headerLeft}>
            <View style={[styles.appIcon, { backgroundColor: colors.iconBg, borderColor: colors.iconBorder }]}>
              <Ionicons name="checkmark-done" size={18} color={isDark ? "#D7E3FF" : "#2D5BD8"} />
            </View>
            <View>
              <Text style={[styles.title, { color: colors.text }]}>Confirm Intent</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Review the audio, then choose the best match.</Text>
            </View>
          </View>
        </View>

        {/* Audio controls */}
        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Audio</Text>
          <Text style={[styles.cardHint, { color: colors.textSecondary }]}>Play the recording to verify it sounds right.</Text>

          <View style={styles.actionsRow}>
            <Pressable
              onPress={onPlay}
              disabled={!safeUri || isWorking}
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: colors.actionBtnBg, borderColor: colors.actionBtnBorder },
                (!safeUri || isWorking) && styles.actionBtnDisabled,
                pressed && !isWorking && safeUri && { opacity: 0.88 },
              ]}
            >
              <Ionicons name="play" size={18} color={isDark ? "#D7E3FF" : "#2D5BD8"} />
              <Text style={[styles.actionText, { color: colors.text }]}>Play</Text>
            </Pressable>

            <Pressable
              onPress={onStop}
              disabled={isWorking}
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: colors.actionBtnBg, borderColor: colors.actionBtnBorder },
                isWorking && styles.actionBtnDisabled,
                pressed && !isWorking && { opacity: 0.88 },
              ]}
            >
              <Ionicons name="square" size={18} color={isDark ? "#D7E3FF" : "#2D5BD8"} />
              <Text style={[styles.actionText, { color: colors.text }]}>Stop</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={onGenerateSuggestions}
            disabled={!canGenerate}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: colors.buttonPrimary },
              !canGenerate && styles.primaryBtnDisabled,
              pressed && canGenerate && { opacity: 0.92 },
            ]}
          >
            <Ionicons
              name={isWorking ? "sparkles" : "sparkles-outline"}
              size={18}
              color={canGenerate ? (isDark ? "#0B1020" : "#FFFFFF") : (isDark ? "rgba(11,16,32,0.55)" : "rgba(255,255,255,0.55)")}
            />
            <Text style={[styles.primaryBtnText, { color: isDark ? "#0B1020" : "#FFFFFF" }, !canGenerate && styles.primaryBtnTextDisabled]}>
              {isWorking ? "Working…" : "Generate Suggestions"}
            </Text>
            <View style={{ width: 18 }} />
          </Pressable>

          {status ? (
            <View style={[styles.statusBox, { backgroundColor: colors.infoBg, borderColor: colors.infoBorder }]}>
              <View style={{ flex: 1 }}>
                <View style={styles.statusHeader}>
                  <Ionicons name="sparkles" size={14} color={isDark ? "#BFD2FF" : "#2D5BD8"} />
                  <Text style={[styles.statusText, { color: colors.text }]}>{status}</Text>
                </View>
                {isWorking && !pending && (
                  <View style={[styles.progressBarBg, { backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" }]}>
                    <Animated.View
                      style={[
                        styles.progressBarFill,
                        { backgroundColor: isDark ? "#D7E3FF" : "#2D5BD8" },
                        progressStyle
                      ]}
                    />
                  </View>
                )}
              </View>
            </View>
          ) : null}
        </View>

        {/* Suggestions */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Suggestions</Text>
          <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>Tap one to select it.</Text>
        </View>

        {suggestions.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <Ionicons name="flash-outline" size={22} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {hasRun ? "No matches found" : "Generating automatically…"}
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {hasRun
                ? "Add the transcript as a new intent, or manage intents manually."
                : "If it doesn’t start, tap Generate Suggestions."}
            </Text>

            {hasRun ? (
              <View style={{ width: "100%", gap: 10, marginTop: 10 }}>
                <Pressable
                  onPress={onAddFromTranscript}
                  disabled={!pending || isWorking}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    { backgroundColor: colors.buttonSecondary, borderColor: colors.cardBorder },
                    (!pending || isWorking) && styles.secondaryBtnDisabled,
                    pressed && pending && !isWorking && { opacity: 0.9 },
                  ]}
                >
                  <Ionicons name="add-circle-outline" size={18} color={isDark ? "#D7E3FF" : "#2D5BD8"} />
                  <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Add transcript as intent</Text>
                </Pressable>

                <Pressable
                  onPress={() => router.push("/(tabs)/intents")}
                  disabled={isWorking}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    { backgroundColor: colors.buttonSecondary, borderColor: colors.cardBorder },
                    isWorking && styles.secondaryBtnDisabled,
                    pressed && !isWorking && { opacity: 0.9 },
                  ]}
                >
                  <Ionicons name="list" size={18} color={isDark ? "#D7E3FF" : "#2D5BD8"} />
                  <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Go to intents</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {suggestions.map((s) => {
              const active = s.intentId === selectedId;
              const strength = s.isAi ? "AI" : scoreLabel(s.score);

              return (
                <Pressable
                  key={s.intentId}
                  onPress={() => setSelectedId(s.intentId)}
                  disabled={isWorking}
                  style={({ pressed }) => [
                    styles.suggCard,
                    { backgroundColor: colors.cardBg, borderColor: colors.cardBorder },
                    active && [styles.suggCardActive, { backgroundColor: isDark ? "rgba(215,227,255,0.10)" : "rgba(45,91,216,0.10)", borderColor: isDark ? "rgba(215,227,255,0.18)" : "rgba(45,91,216,0.18)" }],
                    s.isAi && [styles.suggCardAi, { backgroundColor: isDark ? "rgba(147,112,219,0.08)" : "rgba(147,112,219,0.15)", borderColor: isDark ? "rgba(147,112,219,0.20)" : "rgba(147,112,219,0.30)" }],
                    isWorking && { opacity: 0.6 },
                    pressed && !isWorking && { opacity: 0.92 },
                  ]}
                >
                  <View style={styles.suggTopRow}>
                    <View style={styles.radio}>
                      {active ? <View style={[styles.radioDot, { backgroundColor: isDark ? "rgba(215,227,255,0.90)" : "#2D5BD8" }]} /> : <View style={[styles.radioHollow, { borderColor: isDark ? "rgba(215,227,255,0.30)" : "rgba(0,0,0,0.30)" }]} />}
                    </View>

                    <Text style={[styles.suggLabel, { color: colors.text }]} numberOfLines={2}>
                      {s.label}
                    </Text>

                    <View style={[styles.scorePill, s.isAi && styles.scorePillAi, { backgroundColor: colors.chipBg, borderColor: colors.chipBorder }]}>
                      {s.isAi ? (
                        <>
                          <Ionicons name="sparkles" size={11} color={isDark ? "#D7E3FF" : "#2D5BD8"} />
                          <Text style={[styles.scorePillText, { color: colors.textSecondary }]}>AI Suggested</Text>
                        </>
                      ) : (
                        <Text style={[styles.scorePillText, { color: colors.textSecondary }]}>
                          {strength} • {s.score.toFixed(3)}
                        </Text>
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Bottom Confirm CTA */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable
          onPress={onConfirm}
          disabled={!canConfirm}
          style={({ pressed }) => [
            styles.confirmBtn,
            { backgroundColor: colors.buttonPrimary },
            !canConfirm && styles.confirmBtnDisabled,
            pressed && canConfirm && { opacity: 0.92 },
          ]}
        >
          <Ionicons
            name="checkmark-circle"
            size={20}
            color={canConfirm ? (isDark ? "#0B1020" : "#FFFFFF") : (isDark ? "rgba(11,16,32,0.55)" : "rgba(255,255,255,0.55)")}
          />
          <Text style={[styles.confirmText, { color: isDark ? "#0B1020" : "#FFFFFF" }, !canConfirm && styles.confirmTextDisabled]}>
            {isWorking ? "Saving…" : "Confirm"}
          </Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 18 },

  headerRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
    borderRadius: 12,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  appIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(215,227,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(215,227,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: "#EAF0FF", fontSize: 20, fontWeight: "900" },
  subtitle: { color: "rgba(234,240,255,0.60)", fontSize: 12, marginTop: 2 },

  card: {
    marginTop: 18,
    borderRadius: 22,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  cardTitle: { color: "#EAF0FF", fontSize: 16, fontWeight: "900" },
  cardHint: { marginTop: 6, color: "rgba(234,240,255,0.62)", fontSize: 12 },

  actionsRow: { marginTop: 12, flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "rgba(215,227,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(215,227,255,0.14)",
  },
  actionBtnDisabled: { opacity: 0.55 },
  actionText: { color: "#D7E3FF", fontWeight: "900", fontSize: 14 },

  primaryBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "#D7E3FF",
    borderWidth: 1,
    borderColor: "rgba(215,227,255,0.55)",
  },
  primaryBtnDisabled: {
    backgroundColor: "rgba(215,227,255,0.22)",
    borderColor: "rgba(215,227,255,0.25)",
  },
  primaryBtnText: { color: "#0B1020", fontWeight: "900", fontSize: 14 },
  primaryBtnTextDisabled: { color: "rgba(11,16,32,0.55)" },

  statusBox: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(191,210,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(191,210,255,0.10)",
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  statusText: {
    flex: 1,
    color: "rgba(234,240,255,0.75)",
    fontSize: 12,
    fontWeight: "700",
  },
  progressBarBg: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 4,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#D7E3FF",
    borderRadius: 2,
  },

  sectionHeader: { marginTop: 16, marginBottom: 8 },
  sectionTitle: { color: "#EAF0FF", fontSize: 14, fontWeight: "900" },
  sectionHint: { marginTop: 4, color: "rgba(234,240,255,0.55)", fontSize: 12 },

  empty: {
    marginTop: 12,
    borderRadius: 22,
    padding: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    color: "#EAF0FF",
    fontWeight: "900",
    fontSize: 16,
    marginTop: 4,
    textAlign: "center",
  },
  emptyText: { color: "rgba(234,240,255,0.65)", fontSize: 12, textAlign: "center" },

  secondaryBtn: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "rgba(215,227,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(215,227,255,0.14)",
  },
  secondaryBtnDisabled: { opacity: 0.55 },
  secondaryBtnText: { color: "#D7E3FF", fontWeight: "900", fontSize: 14 },

  suggCard: {
    borderRadius: 22,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  suggCardActive: {
    backgroundColor: "rgba(215,227,255,0.10)",
    borderColor: "rgba(215,227,255,0.18)",
  },
  suggCardAi: {
    backgroundColor: "rgba(147,112,219,0.08)",
    borderColor: "rgba(147,112,219,0.20)",
  },
  suggTopRow: { flexDirection: "row", alignItems: "center", gap: 10 },

  radio: {
    width: 20,
    height: 20,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  radioHollow: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(215,227,255,0.30)",
  },
  radioDot: {
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: "rgba(215,227,255,0.90)",
  },

  suggLabel: { flex: 1, color: "#EAF0FF", fontSize: 14, fontWeight: "900" },

  scorePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(215,227,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(215,227,255,0.14)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  scorePillAi: {
    backgroundColor: "rgba(147,112,219,0.15)",
    borderColor: "rgba(147,112,219,0.30)",
  },
  scorePillText: { color: "rgba(234,240,255,0.75)", fontSize: 11, fontWeight: "800" },

  bottomBar: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 0,
    paddingTop: 10,
  },
  confirmBtn: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: "#D7E3FF",
    borderWidth: 1,
    borderColor: "rgba(215,227,255,0.55)",
  },
  confirmBtnDisabled: {
    backgroundColor: "rgba(215,227,255,0.22)",
    borderColor: "rgba(215,227,255,0.25)",
  },
  confirmText: { color: "#0B1020", fontWeight: "900", fontSize: 15 },
  confirmTextDisabled: { color: "rgba(11,16,32,0.55)" },
});
