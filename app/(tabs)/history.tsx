import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";

import {
  clearHistory,
  getHistory,
  getOrCreateDeviceId,
  HistoryItem,
} from "../../src/services/storageService";

import {
  getPresignedDownloadUrl,
  listRecordings,
  RecordingItem,
  speakText,
} from "../../src/services/apiService";

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

  // Device ID needed for Polly speak calls
  const [deviceId, setDeviceId] = useState<string>("");

  // Loading states
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);

      const did = await getOrCreateDeviceId();
      setDeviceId(did);

      // Load local always
      const local = await getHistory();
      const localItems = local.map(mapLocalToUi);

      // Try backend
      try {
        const res = await listRecordings(did);
        const backendItems = (res.items || []).map(mapBackendToUi);

        // Merge (cloud first), then local — dedupe by s3Key when available
        const seen = new Set<string>();
        const merged: UiItem[] = [];

        for (const it of backendItems) {
          const k = it.s3Key || `${it.source}:${it.id}`;
          if (!seen.has(k)) {
            seen.add(k);
            merged.push(it);
          }
        }

        for (const it of localItems) {
          const k = it.s3Key || `${it.source}:${it.id}`;
          if (!seen.has(k)) {
            seen.add(k);
            merged.push(it);
          }
        }

        // Sort newest first
        merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

        setItems(merged);
        return;
      } catch (backendErr: any) {
        setItems(localItems);
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

  const itemKey = useCallback(
    (item: UiItem) => `${item.source}:${item.id}`,
    [],
  );

  const onPlayItem = async (item: UiItem) => {
    const k = itemKey(item);

    try {
      setError(null);
      setPlayingKey(k);

      // Stop previous playback before starting new
      await stopPlayback();

      // Local playback
      if (item.audioUri) {
        await playRecording(item.audioUri);
        return;
      }

      // Cloud playback
      if (item.s3Key) {
        const { downloadUrl } = await getPresignedDownloadUrl(item.s3Key);
        await playRecording(downloadUrl);
        return;
      }

      Alert.alert("No audio", "This item has no local audioUri or S3 key.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to play recording");
    } finally {
      setPlayingKey(null);
    }
  };

  const onSpeakItem = async (item: UiItem) => {
    const k = itemKey(item);

    try {
      setError(null);
      setSpeakingKey(k);

      const did = deviceId || (await getOrCreateDeviceId());

      // Stop previous playback before speaking
      await stopPlayback();

      const res = await speakText(did, item.intentLabel);
      await playRecording(res.downloadUrl);
    } catch (e: any) {
      setError(e?.message ?? "Failed to speak intent");
    } finally {
      setSpeakingKey(null);
    }
  };

  const isBusy = useMemo(
    () => playingKey !== null || speakingKey !== null,
    [playingKey, speakingKey],
  );

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
        keyExtractor={(item) => `${item.source}:${item.id}`}
        ListEmptyComponent={
          <Text style={{ marginTop: 20 }}>No history yet.</Text>
        }
        renderItem={({ item }) => {
          const k = itemKey(item);
          const isPlayingThis = playingKey === k;
          const isSpeakingThis = speakingKey === k;

          return (
            <View
              style={{
                padding: 14,
                borderWidth: 1,
                borderRadius: 12,
                marginBottom: 10,
                gap: 10,
              }}
            >
              {/* Main tap = play original audio */}
              <Pressable
                onPress={() => onPlayItem(item)}
                disabled={isBusy}
                style={{ opacity: isBusy ? 0.6 : 1 }}
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

                {isPlayingThis ? (
                  <Text style={{ marginTop: 8, opacity: 0.7 }}>
                    Loading audio...
                  </Text>
                ) : null}
              </Pressable>

              {/* Actions row */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={() => onSpeakItem(item)}
                  disabled={isBusy}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderWidth: 1,
                    borderRadius: 10,
                    alignItems: "center",
                    opacity: isBusy ? 0.6 : 1,
                    flex: 1,
                  }}
                >
                  <Text style={{ fontWeight: "700" }}>
                    {isSpeakingThis ? "Speaking..." : "Speak"}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => onPlayItem(item)}
                  disabled={isBusy}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderWidth: 1,
                    borderRadius: 10,
                    alignItems: "center",
                    opacity: isBusy ? 0.6 : 1,
                    flex: 1,
                  }}
                >
                  <Text style={{ fontWeight: "700" }}>
                    {isPlayingThis ? "Loading..." : "Play"}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}
