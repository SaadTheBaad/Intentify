import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { playRecording, stopPlayback } from "../src/services/audioService";
import {
  getOrCreateDeviceId,
  saveHistoryItem,
} from "../src/services/storageService";

import {
  createRecording,
  getPresignedUrl,
  IntentItem,
  listIntents,
  speakText,
} from "../src/services/apiService";

import { uploadToPresignedUrl } from "../src/services/s3UploadService";

export default function ConfirmScreen() {
  const { uri } = useLocalSearchParams<{ uri?: string }>();

  const [deviceId, setDeviceId] = useState<string>("");
  const [intents, setIntents] = useState<IntentItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [status, setStatus] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isLoadingIntents, setIsLoadingIntents] = useState(false);

  const safeUri = useMemo(() => (typeof uri === "string" ? uri : null), [uri]);

  const loadIntents = async () => {
    try {
      setIsLoadingIntents(true);

      const did = await getOrCreateDeviceId();
      setDeviceId(did);

      const res = await listIntents(did);
      const items = res.items || [];
      setIntents(items);

      if (!selectedId && items.length > 0) setSelectedId(items[0].intentId);
    } catch (e: any) {
      Alert.alert("Failed to load intents", e?.message ?? "Unknown error");
    } finally {
      setIsLoadingIntents(false);
    }
  };

  useEffect(() => {
    loadIntents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPlay = async () => {
    if (!safeUri) return;
    await playRecording(safeUri);
  };

  const onStop = async () => {
    await stopPlayback();
  };

  const onConfirm = async () => {
    if (!safeUri) {
      Alert.alert("Missing audio", "No recording URI was provided.");
      return;
    }
    if (!selectedId) {
      Alert.alert(
        "Pick an intent",
        "Please select one of your approved intents.",
      );
      return;
    }

    const selected = intents.find((i) => i.intentId === selectedId);
    if (!selected) {
      Alert.alert("Pick an intent", "Please select a valid intent.");
      return;
    }

    try {
      setIsConfirming(true);
      setStatus(null);

      const did = deviceId || (await getOrCreateDeviceId());
      const recordingId = `${Date.now()}`;
      const createdAt = new Date().toISOString();

      // 1) Get presigned PUT URL
      setStatus("Getting upload URL...");
      const { uploadUrl, key } = await getPresignedUrl(did);

      // 2) Upload audio to S3
      setStatus("Uploading audio...");
      await uploadToPresignedUrl(uploadUrl, safeUri);

      // 3) Save locally (offline-friendly cache)
      setStatus("Saving locally...");
      await saveHistoryItem({
        id: recordingId,
        createdAt,
        audioUri: safeUri,
        intentId: selected.intentId,
        intentLabel: selected.label,
        s3Key: key,
      });

      // 4) Save recording metadata to DynamoDB
      setStatus("Saving to cloud...");
      await createRecording({
        deviceId: did,
        recordingId,
        s3Key: key,
        confirmedIntent: selected.label,
        createdAt,
      });

      // 5) Speak confirmed intent (Polly)
      setStatus("Speaking...");
      const tts = await speakText(did, selected.label);
      await playRecording(tts.downloadUrl);

      setStatus("Done ✅");
      router.replace("/(tabs)/history");
    } catch (e: any) {
      Alert.alert("Confirm failed", e?.message ?? "Unknown error");
      setStatus(null);
    } finally {
      setIsConfirming(false);
    }
  };

  const canConfirm =
    !!safeUri &&
    !!selectedId &&
    !isConfirming &&
    !isLoadingIntents &&
    intents.length > 0;

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

      <View
        style={{
          marginTop: 10,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontWeight: "600" }}>Suggestions</Text>

        <Pressable
          onPress={() => router.push("/(tabs)/intents")}
          disabled={isConfirming}
          style={{
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderWidth: 1,
            borderRadius: 10,
            opacity: isConfirming ? 0.5 : 1,
          }}
        >
          <Text>Edit</Text>
        </Pressable>
      </View>

      {isLoadingIntents ? (
        <Text style={{ marginTop: 6, opacity: 0.7 }}>Loading intents...</Text>
      ) : intents.length === 0 ? (
        <View style={{ marginTop: 6, gap: 10 }}>
          <Text style={{ opacity: 0.75 }}>
            No intents yet. Add some in the Intents tab first.
          </Text>

          <Pressable
            onPress={() => router.push("/(tabs)/intents")}
            style={{
              padding: 12,
              borderWidth: 1,
              borderRadius: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ fontWeight: "700" }}>Go to Intents</Text>
          </Pressable>
        </View>
      ) : (
        intents.map((intent) => {
          const active = intent.intentId === selectedId;
          return (
            <Pressable
              key={intent.intentId}
              onPress={() => setSelectedId(intent.intentId)}
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
          {isConfirming ? "Confirming..." : "Confirm"}
        </Text>
      </Pressable>
    </View>
  );
}
