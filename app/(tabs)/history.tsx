import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import {
    clearHistory,
    getHistory,
    HistoryItem,
} from "../../src/services/storageService";

import { playRecording, stopPlayback } from "../../src/services/audioService";

export default function HistoryScreen() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      const data = await getHistory();
      setItems(data);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load history");
    }
  };

  // Reload history every time the History tab is focused
  useFocusEffect(
    useCallback(() => {
      load();
    }, []),
  );

  const onClear = async () => {
    try {
      setError(null);
      await stopPlayback(); // stop any playing audio
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

  const onPlayItem = async (item: HistoryItem) => {
    try {
      setError(null);
      await playRecording(item.audioUri);
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

      {/* List */}
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
            <Text style={{ fontWeight: "600" }}>{item.intentLabel}</Text>
            <Text style={{ marginTop: 6, opacity: 0.7 }}>
              {new Date(item.createdAt).toLocaleString()}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}