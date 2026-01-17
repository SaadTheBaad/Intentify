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

  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadedKey, setUploadedKey] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

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
      setIsUploading(true);
      setUploadStatus("Getting upload URL...");

      const deviceId = await getOrCreateDeviceId();
      const { uploadUrl, key } = await getPresignedUrl(deviceId);

      setUploadStatus("Uploading to S3...");
      await uploadToPresignedUrl(uploadUrl, safeUri);

      setUploadedKey(key);
      setUploadStatus(`Uploaded ✅\nS3 key:\n${key}`);
    } catch (e: any) {
      setUploadStatus(`Upload failed: ${e?.message ?? "unknown error"}`);
    } finally {
      setIsUploading(false);
    }
  };

  const onConfirm = async () => {
    if (!safeUri || !selectedId) return;

    const selected = MOCK_INTENTS.find((i) => i.id === selectedId);
    if (!selected) return;

    try {
      setIsConfirming(true);

      const deviceId = await getOrCreateDeviceId();
      const recordingId = `${Date.now()}`;
      const createdAt = new Date().toISOString();

      // 1) Always save locally (offline-safe)
      await saveHistoryItem({
        id: recordingId,
        createdAt,
        audioUri: safeUri,
        intentId: selected.id,
        intentLabel: selected.label,
        s3Key: uploadedKey ?? undefined,
      });

      // 2) If uploaded to S3, also save to DynamoDB
      if (uploadedKey) {
        await createRecording({
          deviceId,
          recordingId,
          s3Key: uploadedKey,
          confirmedIntent: selected.label,
          createdAt,
          // durationSeconds: (optional) add later if you track it
        });
      } else {
        // Not blocking, but helpful UX
        // You can remove this if you want silent local-only behavior.
        Alert.alert(
          "Saved locally",
          "You confirmed an intent, but it wasn’t uploaded to S3 yet. History will still show locally.",
        );
      }

      router.replace("/(tabs)/history");
    } catch (e: any) {
      Alert.alert("Confirm failed", e?.message ?? "Unknown error");
    } finally {
      setIsConfirming(false);
    }
  };

  const canConfirm = !!selectedId;
  const canUpload = !!safeUri && !isUploading;

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

      {/* Upload to S3 */}
      <Pressable
        onPress={onUploadToS3}
        disabled={!canUpload}
        style={{
          padding: 14,
          borderWidth: 1,
          borderRadius: 12,
          marginTop: 6,
          alignItems: "center",
          opacity: canUpload ? 1 : 0.4,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "600" }}>
          {isUploading ? "Uploading..." : uploadedKey ? "Re-upload to S3" : "Upload to S3"}
        </Text>
      </Pressable>

      {uploadStatus ? (
        <Text style={{ marginTop: 6, textAlign: "center" }}>{uploadStatus}</Text>
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
        disabled={!canConfirm || isConfirming}
        style={{
          marginTop: 14,
          padding: 14,
          borderRadius: 12,
          borderWidth: 1,
          opacity: canConfirm && !isConfirming ? 1 : 0.4,
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "600" }}>
          {isConfirming ? "Saving..." : "Confirm"}
        </Text>
      </Pressable>
    </View>
  );
}
