import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { playRecording, stopPlayback } from "../src/services/audioService";
import { saveHistoryItem } from "../src/services/storageService";

import { getPresignedUrl } from "../src/services/apiService";
import { uploadToPresignedUrl } from "../src/services/s3UploadService";

const MOCK_INTENTS = [
  { id: "refill", label: "I need a refill" },
  { id: "pain", label: "I’m in pain here" },
  { id: "caregiver", label: "Please call my caregiver" },
];

export default function ConfirmScreen() {
  const { uri } = useLocalSearchParams<{ uri?: string }>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const safeUri = useMemo(() => (typeof uri === "string" ? uri : null), [uri]);

  const onPlay = async () => {
    if (!safeUri) return;
    await playRecording(safeUri);
  };

  const onStop = async () => {
    await stopPlayback();
  };

  const onUploadToS3 = async () => {
    if (!safeUri) return;

    try {
      setUploadStatus("Getting upload URL...");
      const { uploadUrl, key } = await getPresignedUrl("anon");

      setUploadStatus("Uploading to S3...");
      await uploadToPresignedUrl(uploadUrl, safeUri);

      setUploadStatus(`Uploaded ✅\nS3 key:\n${key}`);
    } catch (e: any) {
      setUploadStatus(`Upload failed: ${e?.message ?? "unknown error"}`);
    }
  };

  const onConfirm = async () => {
    if (!safeUri || !selectedId) return;

    const selected = MOCK_INTENTS.find((i) => i.id === selectedId);
    if (!selected) return;

    await saveHistoryItem({
      id: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      audioUri: safeUri,
      intentId: selected.id,
      intentLabel: selected.label,
    });

    // Go to History tab
    router.replace("/(tabs)/history");
  };

  return (
    <View style={{ flex: 1, padding: 24, justifyContent: "center", gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: "700", textAlign: "center" }}>
        Confirm Intent
      </Text>

      <View style={{ flexDirection: "row", justifyContent: "center", gap: 12 }}>
        <Pressable
          onPress={onPlay}
          style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}
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

      {/* NEW: Upload to S3 */}
      <Pressable
        onPress={onUploadToS3}
        disabled={!safeUri}
        style={{
          padding: 14,
          borderWidth: 1,
          borderRadius: 12,
          marginTop: 6,
          alignItems: "center",
          opacity: safeUri ? 1 : 0.4,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "600" }}>Upload to S3</Text>
      </Pressable>

      {uploadStatus ? (
        <Text style={{ marginTop: 6, textAlign: "center" }}>
          {uploadStatus}
        </Text>
      ) : null}

      <Text style={{ marginTop: 10, fontWeight: "600" }}>Suggestions</Text>

      {MOCK_INTENTS.map((intent) => {
        const active = intent.id === selectedId;
        return (
          <Pressable
            key={intent.id}
            onPress={() => setSelectedId(intent.id)}
            style={{
              padding: 14,
              borderWidth: 1,
              borderRadius: 12,
              opacity: active ? 1 : 0.7,
            }}
          >
            <Text style={{ fontSize: 16 }}>{intent.label}</Text>
          </Pressable>
        );
      })}

      <Pressable
        onPress={onConfirm}
        disabled={!selectedId}
        style={{
          marginTop: 14,
          padding: 14,
          borderRadius: 12,
          borderWidth: 1,
          opacity: selectedId ? 1 : 0.4,
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "600" }}>Confirm</Text>
      </Pressable>
    </View>
  );
}