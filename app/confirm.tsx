import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

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
  transcribeFromS3,
} from "../src/services/apiService";

import { uploadToPresignedUrl } from "../src/services/s3UploadService";

type Suggestion = { intentId: string; label: string; score: number };

function makeIntentId(label: string) {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 50) || `intent-${Date.now()}`
  );
}

export default function ConfirmScreen() {
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

  // Runs the whole pipeline once, then shows suggestions
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

      // 1) Presign PUT
      setStatus("Getting upload URL...");
      const { uploadUrl, key } = await getPresignedUrl(deviceId);

      // 2) Upload audio to S3
      setStatus("Uploading audio...");
      await uploadToPresignedUrl(uploadUrl, safeUri);

      // 3) Transcribe (OpenAI on backend) - single call
      setStatus("Transcribing...");
      const tRes = await transcribeFromS3(deviceId, key);
      const transcript = (tRes.transcript || "").trim();

      if (!transcript) {
        throw new Error("No transcript returned (try recording again).");
      }

      // 4) Match intents (your /match endpoint)
      setStatus("Finding best intent...");
      const matchRes = await matchIntents(deviceId, transcript, 3);

      const sugg = matchRes.suggestions || [];
      setSuggestions(sugg);
      if (sugg.length > 0) setSelectedId(sugg[0].intentId);

      // 5) Store pending for Confirm step
      setPending({ deviceId, recordingId, createdAt, s3Key: key, transcript });

      setHasRun(true);
      setStatus("Pick the best match, then Confirm ✅");
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
      setStatus("Saving...");

      // Save local (offline-friendly cache)
      await saveHistoryItem({
        id: pending.recordingId,
        createdAt: pending.createdAt,
        audioUri: safeUri || "",
        intentId: selected.intentId,
        intentLabel: selected.label,
        s3Key: pending.s3Key,
      });

      // Save cloud metadata
      await createRecording({
        deviceId: pending.deviceId,
        recordingId: pending.recordingId,
        s3Key: pending.s3Key,
        confirmedIntent: selected.label,
        createdAt: pending.createdAt,
        transcript: pending.transcript,
      });

      setStatus("Done ✅");
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
      setStatus("Adding intent...");

      const intentId = makeIntentId(label);
      await createIntent(pending.deviceId, intentId, label);

      const next = [{ intentId, label, score: 1 }];
      setSuggestions(next);
      setSelectedId(intentId);
      setStatus("Intent added. Review and Confirm ✅");
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
    <View style={{ flex: 1, padding: 24, justifyContent: "center", gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: "700", textAlign: "center" }}>
        Confirm Intent
      </Text>

      <View style={{ flexDirection: "row", justifyContent: "center", gap: 12 }}>
        <Pressable
          onPress={onPlay}
          disabled={!safeUri}
          style={{
            padding: 12,
            borderWidth: 1,
            borderRadius: 12,
            opacity: safeUri ? 1 : 0.4,
          }}
        >
          <Text>Play</Text>
        </Pressable>

        <Pressable
          onPress={onStop}
          style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}
        >
          <Text>Stop</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={onGenerateSuggestions}
        disabled={!canGenerate}
        style={{
          marginTop: 8,
          padding: 14,
          borderWidth: 1,
          borderRadius: 12,
          opacity: canGenerate ? 1 : 0.4,
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "600" }}>
          {isWorking ? "Working..." : "Generate Suggestions (AI)"}
        </Text>
      </Pressable>

      {status ? <Text style={{ textAlign: "center" }}>{status}</Text> : null}

      <Text style={{ marginTop: 10, fontWeight: "600" }}>Suggestions</Text>

      {suggestions.length === 0 ? (
        <>
          <Text style={{ opacity: 0.7 }}>
            {hasRun
              ? "No intents exist for this device yet."
              : "No suggestions yet. Press “Generate Suggestions (AI)”."}
          </Text>
          {hasRun ? (
            <View style={{ marginTop: 10, gap: 10 }}>
              <Pressable
                onPress={onAddFromTranscript}
                disabled={!pending || isWorking}
                style={{
                  padding: 12,
                  borderWidth: 1,
                  borderRadius: 12,
                  alignItems: "center",
                  opacity: !pending || isWorking ? 0.5 : 1,
                }}
              >
                <Text style={{ fontWeight: "600" }}>Add Transcript as Intent</Text>
              </Pressable>

              <Pressable
                onPress={() => router.push("/(tabs)/intents")}
                disabled={isWorking}
                style={{
                  padding: 12,
                  borderWidth: 1,
                  borderRadius: 12,
                  alignItems: "center",
                  opacity: isWorking ? 0.5 : 1,
                }}
              >
                <Text style={{ fontWeight: "600" }}>Go to Intents</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      ) : (
        suggestions.map((s) => {
          const active = s.intentId === selectedId;
          return (
            <Pressable
              key={s.intentId}
              onPress={() => setSelectedId(s.intentId)}
              disabled={isWorking}
              style={{
                padding: 14,
                borderWidth: 1,
                borderRadius: 12,
                opacity: isWorking ? 0.5 : active ? 1 : 0.7,
              }}
            >
              <Text style={{ fontSize: 16 }}>{s.label}</Text>
              <Text style={{ marginTop: 6, opacity: 0.6, fontSize: 12 }}>
                score: {s.score.toFixed(3)}
              </Text>
            </Pressable>
          );
        })
      )}

      <Pressable
        onPress={onConfirm}
        disabled={!canConfirm}
        style={{
          marginTop: 14,
          padding: 14,
          borderRadius: 12,
          borderWidth: 1,
          opacity: canConfirm ? 1 : 0.4,
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "600" }}>
          {isWorking ? "Saving..." : "Confirm"}
        </Text>
      </Pressable>
    </View>
  );
}
