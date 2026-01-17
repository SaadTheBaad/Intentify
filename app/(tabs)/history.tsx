import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";

import {
  clearHistory,
  getHistory,
  getOrCreateDeviceId,
  HistoryItem,
} from "../../src/services/storageService";

import { listRecordings, RecordingItem } from "../../src/services/apiService";
import { playRecording, stopPlayback } from "../../src/services/audioService";

type UiItem = {
  id: string;
  createdAt: string;
  intentLabel: string;
  audioUri?: string; // local only
  s3Key?: string; // backend or local
  source: "backend" | "local";
};

function mapBackendToUi(item: RecordingItem): UiItem {
  return {
    id: item.recordingId,
    createdAt: item.createdAt,
    intentLabel: item.confirmedIntent,
    s3Key: item.s3Key,
    source: "backend",
  };
}

function mapLocalToUi(item: HistoryItem): UiItem {
  return {
    id: item.id,
    createdAt: item.createdAt,
    intentLabel: item.intentLabel,
    audioUri: item.audioUri,
    s3Key: item.s3Key,
    source: "local",
  };
}

export default function HistoryScreen() {
  const [items, setItems] = useState<UiItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);

      const deviceId = await getOrCreateDeviceId();

      // 1) Try backend first
      try {
        const res = await listRecordings(deviceId);
        const backendItems = (res.items || []).map(mapBackendToUi);
        setItems(backendItems);
        return;
      } catch (backendErr: any) {
        // Backend failed — fallback to local storage
        const local = await getHistory();
        setItems(local.map(mapLocalToUi));
        setError(
          `Backend unavailable, showing local history. (${backendErr?.message ?? "error"})`,
        );
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load history");
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, []),
  );

  const onClear = async () => {
    try {
      setError(null);
      await stopPlayback();
      await clearHistory();
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to clear history");
    }
  };

  const onStopAudio = async () => {
    try {
      setError(null);
      await stopPlayback();
    } catch (e: any) {
      setError(e?.message ?? "Failed to stop audio");
    }
  };

  const onPlayItem = async (item: UiItem) => {
    try {
      setError(null);

      // If it’s local and we have the file URI, play it
      if (item.audioUri) {
        await playRecording(item.audioUri);
        return;
      }

      // If it’s backend-only, we don’t have a presigned GET yet
      Alert.alert(
        "Playback not available yet",
        "This entry came from the cloud history. Next step is adding a secure presigned GET endpoint for playback.",
      );
    } catch (e: any) {
      setError(e?.message ?? "Failed to play recording");
    }
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 22, fontWeight: "700" }}>History</Text>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={onStopAudio}
            style={{ padding: 10, borderWidth: 1, borderRadius: 10 }}
          >
            <Text>Stop</Text>
          </Pressable>

          <Pressable
            onPress={onClear}
            style={{ padding: 10, borderWidth: 1, borderRadius: 10 }}
          >
            <Text>Clear</Text>
          </Pressable>
        </View>
      </View>

      {error ? (
        <Text style={{ marginTop: 10, color: "red" }}>{error}</Text>
      ) : null}

      <FlatList
        style={{ marginTop: 12 }}
        data={items}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={{ marginTop: 20 }}>No history yet.</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onPlayItem(item)}
            style={{
              padding: 14,
              borderWidth: 1,
              borderRadius: 12,
              marginBottom: 10,
            }}
          >
            <Text style={{ fontWeight: "600" }}>
              {item.intentLabel}{" "}
              <Text style={{ opacity: 0.6 }}>
                ({item.source === "backend" ? "cloud" : "local"})
              </Text>
            </Text>

            <Text style={{ marginTop: 6, opacity: 0.7 }}>
              {new Date(item.createdAt).toLocaleString()}
            </Text>

            {item.s3Key ? (
              <Text style={{ marginTop: 6, opacity: 0.6, fontSize: 12 }}>
                S3: {item.s3Key}
              </Text>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}
