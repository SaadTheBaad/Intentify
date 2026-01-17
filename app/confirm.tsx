import { Ionicons } from "@expo/vector-icons";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { playRecording, stopPlayback } from "../src/services/audioService";
import {
  getOrCreateDeviceId,
  saveHistoryItem,
} from "../src/services/storageService";

import {
  createIntent,
  createRecording,
  getPresignedUrl,
  matchIntents,
  suggestIntent,
  transcribeFromS3,
} from "../src/services/apiService";
import { makeIntentId } from "../src/utils/intent";

import { uploadToPresignedUrl } from "../src/services/s3UploadService";

type Suggestion = { 
  intentId: string; 
  label: string; 
  score: number;
  isAi?: boolean;
};

function scoreLabel(score: number) {
  if (score >= 0.6) return "High";
  if (score >= 0.35) return "Medium";
  return "Low";
}

export default function ConfirmScreen() {
  const insets = useSafeAreaInsets();

  const { uri } = useLocalSearchParams<{ uri?: string }>();
  const safeUri = useMemo(() => (typeof uri === "string" ? uri : null), [uri]);
  const lastAutoUri = useRef<string | null>(null);

  const [status, setStatus] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [pending, setPending] = useState<{
    deviceId: string;
    recordingId: string;
    createdAt: string;
    s3Key: string;
    transcript: string;
  } | null>(null);

  const onPlay = async () => {
    if (!safeUri) return;
    await playRecording(safeUri);
  };

  const onStop = async () => {
    await stopPlayback();
  };

  const runPipeline = async () => {
    if (!safeUri) return;

    setIsWorking(true);
    setStatus(null);
    setSuggestions([]);
    setSelectedId(null);
    setPending(null);
    setHasRun(false);

    try {
      const deviceId = await getOrCreateDeviceId();
      const recordingId = `${Date.now()}`;
      const createdAt = new Date().toISOString();

      setStatus("Getting upload URL…");
      const { uploadUrl, key } = await getPresignedUrl(deviceId);

      setStatus("Uploading audio…");
      await uploadToPresignedUrl(uploadUrl, safeUri);

      setStatus("Transcribing…");
      const tRes = await transcribeFromS3(deviceId, key);
      const transcript = (tRes.transcript || "").trim();

      if (!transcript) {
        throw new Error("No transcript returned (try recording again).");
      }

      setStatus("Finding best intent…");
      const matchRes = await matchIntents(deviceId, transcript, 3);

      const sugg = matchRes.suggestions || [];
      const LOW_SCORE_THRESHOLD = 0.35;
      
      // Check if we need AI suggestion: no matches or all scores too low
      const needsAiSuggestion = 
        sugg.length === 0 || 
        sugg.every(s => s.score < LOW_SCORE_THRESHOLD);

      if (needsAiSuggestion) {
        setStatus("Generating AI suggestion…");
        const aiRes = await suggestIntent(transcript);
        
        // Create a synthetic suggestion with the AI-generated intent
        const aiIntentId = `ai-suggestion-${Date.now()}`;
        const aiSuggestions: Suggestion[] = [{
          intentId: aiIntentId,
          label: aiRes.suggestion.label,
          score: 0,
          isAi: true
        }];
        
        setSuggestions(aiSuggestions);
        setSelectedId(aiIntentId);
      } else {
        setSuggestions(sugg);
        if (sugg.length > 0) setSelectedId(sugg[0].intentId);
      }

      setPending({ deviceId, recordingId, createdAt, s3Key: key, transcript });

      setHasRun(true);
      setStatus(needsAiSuggestion 
        ? "AI suggested an intent for you. Review and Confirm!" 
        : "Pick the best match, then Confirm!");
    } finally {
      setIsWorking(false);
    }
  };

  const onGenerateSuggestions = async () => {
    try {
      await runPipeline();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Unknown error");
      setStatus(null);
      setPending(null);
      setSuggestions([]);
      setSelectedId(null);
      setIsWorking(false);
    }
  };

  const onConfirm = async () => {
    if (!pending || !selectedId) return;

    const selected = suggestions.find((s) => s.intentId === selectedId);
    if (!selected) return;

    try {
      setIsWorking(true);
      setStatus("Saving…");

      // If this is an AI-generated suggestion, create it as a new intent first
      let finalIntentId = selected.intentId;
      if (selected.isAi) {
        const newIntentId = makeIntentId(selected.label);
        
        // Check if this intent already exists (avoid duplicates)
        const existingMatch = suggestions.find(
          s => !s.isAi && makeIntentId(s.label) === newIntentId
        );
        
        if (!existingMatch) {
          setStatus("Adding AI-suggested intent…");
          await createIntent(pending.deviceId, newIntentId, selected.label);
        } else {
          // Use the existing intent ID instead
          finalIntentId = existingMatch.intentId;
        }
        
        if (!existingMatch) {
          finalIntentId = newIntentId;
        }
      }

      await saveHistoryItem({
        id: pending.recordingId,
        createdAt: pending.createdAt,
        audioUri: safeUri || "",
        intentId: finalIntentId,
        intentLabel: selected.label,
        s3Key: pending.s3Key,
      });

      await createRecording({
        deviceId: pending.deviceId,
        recordingId: pending.recordingId,
        s3Key: pending.s3Key,
        confirmedIntent: selected.label,
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

      const next = [{ intentId, label, score: 1 }];
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
      colors={["#0B1020", "#0E1731", "#0A0F1F"]}
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
      <ScrollView
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.appIcon}>
              <Ionicons name="checkmark-done" size={18} color="#D7E3FF" />
            </View>
            <View>
              <Text style={styles.title}>Confirm Intent</Text>
              <Text style={styles.subtitle}>
                Review the audio, then choose the best match.
              </Text>
            </View>
          </View>
        </View>

        {/* Audio controls */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Audio</Text>
          <Text style={styles.cardHint}>
            Play the recording to verify it sounds right.
          </Text>

          <View style={styles.actionsRow}>
            <Pressable
              onPress={onPlay}
              disabled={!safeUri || isWorking}
              style={({ pressed }) => [
                styles.actionBtn,
                (!safeUri || isWorking) && styles.actionBtnDisabled,
                pressed && !isWorking && safeUri && { opacity: 0.88 },
              ]}
            >
              <Ionicons name="play" size={18} color="#D7E3FF" />
              <Text style={styles.actionText}>Play</Text>
            </Pressable>

            <Pressable
              onPress={onStop}
              disabled={isWorking}
              style={({ pressed }) => [
                styles.actionBtn,
                isWorking && styles.actionBtnDisabled,
                pressed && !isWorking && { opacity: 0.88 },
              ]}
            >
              <Ionicons name="square" size={18} color="#D7E3FF" />
              <Text style={styles.actionText}>Stop</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={onGenerateSuggestions}
            disabled={!canGenerate}
            style={({ pressed }) => [
              styles.primaryBtn,
              !canGenerate && styles.primaryBtnDisabled,
              pressed && canGenerate && { opacity: 0.92 },
            ]}
          >
            <Ionicons
              name={isWorking ? "sparkles" : "sparkles-outline"}
              size={18}
              color={canGenerate ? "#0B1020" : "rgba(11,16,32,0.55)"}
            />
            <Text
              style={[
                styles.primaryBtnText,
                !canGenerate && styles.primaryBtnTextDisabled,
              ]}
            >
              {isWorking ? "Working…" : "Generate Suggestions"}
            </Text>
            <View style={{ width: 18 }} />
          </Pressable>

          {status ? (
            <View style={styles.statusBox}>
              <Ionicons name="information-circle" size={16} color="#BFD2FF" />
              <Text style={styles.statusText}>{status}</Text>
            </View>
          ) : null}
        </View>

        {/* Suggestions */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Suggestions</Text>
          <Text style={styles.sectionHint}>Tap one to select it.</Text>
        </View>

        {suggestions.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons
              name="flash-outline"
              size={22}
              color="rgba(215,227,255,0.55)"
            />
            <Text style={styles.emptyTitle}>
              {hasRun ? "No matches found" : "Generating automatically…"}
            </Text>
            <Text style={styles.emptyText}>
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
                    (!pending || isWorking) && styles.secondaryBtnDisabled,
                    pressed && pending && !isWorking && { opacity: 0.9 },
                  ]}
                >
                  <Ionicons name="add-circle-outline" size={18} color="#D7E3FF" />
                  <Text style={styles.secondaryBtnText}>
                    Add transcript as intent
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => router.push("/(tabs)/intents")}
                  disabled={isWorking}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    isWorking && styles.secondaryBtnDisabled,
                    pressed && !isWorking && { opacity: 0.9 },
                  ]}
                >
                  <Ionicons name="list" size={18} color="#D7E3FF" />
                  <Text style={styles.secondaryBtnText}>Go to intents</Text>
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
                    active && styles.suggCardActive,
                    s.isAi && styles.suggCardAi,
                    isWorking && { opacity: 0.6 },
                    pressed && !isWorking && { opacity: 0.92 },
                  ]}
                >
                  <View style={styles.suggTopRow}>
                    <View style={styles.radio}>
                      {active ? (
                        <View style={styles.radioDot} />
                      ) : (
                        <View style={styles.radioHollow} />
                      )}
                    </View>

                    <Text style={styles.suggLabel} numberOfLines={2}>
                      {s.label}
                    </Text>

                    <View style={[styles.scorePill, s.isAi && styles.scorePillAi]}>
                      {s.isAi ? (
                        <>
                          <Ionicons name="sparkles" size={11} color="#D7E3FF" />
                          <Text style={styles.scorePillText}>AI Suggested</Text>
                        </>
                      ) : (
                        <Text style={styles.scorePillText}>
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
      <View
        style={[
          styles.bottomBar,
          { paddingBottom: Math.max(insets.bottom, 14) },
        ]}
      >
        <Pressable
          onPress={onConfirm}
          disabled={!canConfirm}
          style={({ pressed }) => [
            styles.confirmBtn,
            !canConfirm && styles.confirmBtnDisabled,
            pressed && canConfirm && { opacity: 0.92 },
          ]}
        >
          <Ionicons
            name="checkmark-circle"
            size={20}
            color={canConfirm ? "#0B1020" : "rgba(11,16,32,0.55)"}
          />
          <Text
            style={[
              styles.confirmText,
              !canConfirm && styles.confirmTextDisabled,
            ]}
          >
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
    justifyContent: "space-between",
    gap: 12,
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

  // (chip styles left in case you reuse later)

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
  statusText: {
    flex: 1,
    color: "rgba(234,240,255,0.75)",
    fontSize: 12,
    fontWeight: "700",
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
