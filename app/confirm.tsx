import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { playRecording, stopPlayback } from "../src/services/audioService";
import {
  getOrCreateDeviceId,
  saveHistoryItem,
} from "../src/services/storageService";

import { createRecording, getPresignedUrl } from "../src/services/apiService";
import { uploadToPresignedUrl } from "../src/services/s3UploadService";

const MOCK_INTENTS = [
  { id: "refill", label: "I need a refill" },
  { id: "pain", label: "I’m in pain here" },
  { id: "caregiver", label: "Please call my caregiver" },
];

export default function ConfirmScreen() {
  const { uri } = useLocalSearchParams<{ uri?: string }>();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [status, setStatus] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const safeUri = useMemo(() => (typeof uri === "string" ? uri : null), [uri]);

  const onPlay = async () => {
    if (!safeUri) return;
    await playRecording(safeUri);
  };

  const onStop = async () => {
    await stopPlayback();
  };

  const onConfirm = async () => {
    if (!safeUri || !selectedId) return;

    const selected = MOCK_INTENTS.find((i) => i.id === selectedId);
    if (!selected) return;

    try {
      setIsConfirming(true);
      setStatus(null);

      const deviceId = await getOrCreateDeviceId();
      const recordingId = `${Date.now()}`;
      const createdAt = new Date().toISOString();

      // 1) Get presigned PUT URL
      setStatus("Getting upload URL...");
      const { uploadUrl, key } = await getPresignedUrl(deviceId);

      // 2) Upload audio to S3
      setStatus("Uploading audio...");
      await uploadToPresignedUrl(uploadUrl, safeUri);

      // 3) Save locally (offline-friendly cache)
      setStatus("Saving locally...");
      await saveHistoryItem({
        id: recordingId,
        createdAt,
        audioUri: safeUri,
        intentId: selected.id,
        intentLabel: selected.label,
        s3Key: key,
      });

      // 4) Save to DynamoDB
      setStatus("Saving to cloud...");
      await createRecording({
        deviceId,
        recordingId,
        s3Key: key,
        confirmedIntent: selected.label,
        createdAt,
        // durationSeconds: add later if you track it
      });

      setStatus("Done ✅");
      router.replace("/(tabs)/history");
    } catch (e: any) {
      Alert.alert("Confirm failed", e?.message ?? "Unknown error");
      setStatus(null);
    } finally {
      setIsConfirming(false);
    }
  };

  const canConfirm = !!selectedId && !!safeUri && !isConfirming;

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

      {status ? (
        <Text style={{ marginTop: 6, textAlign: "center" }}>{status}</Text>
      ) : null}

      <Text style={{ marginTop: 10, fontWeight: "600" }}>Suggestions</Text>

      {MOCK_INTENTS.map((intent) => {
        const active = intent.id === selectedId;
        return (
          <Pressable
            key={intent.id}
            onPress={() => setSelectedId(intent.id)}
            disabled={isConfirming}
            style={{
              padding: 14,
              borderWidth: 1,
              borderRadius: 12,
              opacity: isConfirming ? 0.5 : active ? 1 : 0.7,
            }}
          >
            <Text style={{ fontSize: 16 }}>{intent.label}</Text>
          </Pressable>
        );
      })}

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
          {isConfirming ? "Confirming..." : "Confirm"}
        </Text>
      </Pressable>
    </View>
  );
}
