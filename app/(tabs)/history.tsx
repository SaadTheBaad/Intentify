import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
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
import { ThemeColors, useTheme } from "../../src/theme/theme";

type UiItem = {
  id: string;
  createdAt: string;
  intentLabel: string;
  audioUri?: string;
  s3Key?: string;
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

function formatWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();

  if (isToday) {
    return `Today at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { colors, mode } = useTheme();
  const styles = useMemo(() => makeStyles(colors, mode), [colors, mode]);
  const primaryTextColor = mode === "dark" ? "#0B1020" : "#F8FAFF";
  const [items, setItems] = useState<UiItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string>("");
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      const did = await getOrCreateDeviceId();
      setDeviceId(did);
      const local = await getHistory();
      const localItems = local.map(mapLocalToUi);

      try {
        const res = await listRecordings(did);
        const backendItems = (res.items || []).map(mapBackendToUi);
        const seen = new Set<string>();
        const merged: UiItem[] = [];

        for (const it of [...backendItems, ...localItems]) {
          const k = it.s3Key || `${it.source}:${it.id}`;
          if (!seen.has(k)) {
            seen.add(k);
            merged.push(it);
          }
        }

        merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setItems(merged);
      } catch (backendErr: any) {
        setItems(localItems);
        setError("Offline mode: showing local history.");
      }
    } catch (e: any) {
      setError("Failed to load history");
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, []),
  );

  const itemKey = (item: UiItem) => `${item.source}:${item.id}`;

  const onPlayItem = async (item: UiItem) => {
    const k = itemKey(item);
    try {
      if (playingKey === k) {
        await stopPlayback();
        setPlayingKey(null);
        return;
      }
      setPlayingKey(k);
      await stopPlayback();
      if (item.audioUri) return await playRecording(item.audioUri);
      if (item.s3Key) {
        const { downloadUrl } = await getPresignedDownloadUrl(item.s3Key);
        return await playRecording(downloadUrl);
      }
      Alert.alert("No audio found");
    } catch (e) {
      setError("Playback failed");
      setPlayingKey(null);
    }
  };

  const onSpeakItem = async (item: UiItem) => {
    const k = itemKey(item);
    try {
      setSpeakingKey(k);
      await stopPlayback();
      const res = await speakText(deviceId, item.intentLabel);
      await playRecording(res.downloadUrl);
    } catch (e) {
      setError("Speech synthesis failed");
    } finally {
      setSpeakingKey(null);
    }
  };

  const isBusy = playingKey !== null || speakingKey !== null;

  return (
    <LinearGradient colors={colors.background as any} style={styles.container}>
      {/* Decorative Atmosphere Blobs */}
      <View style={styles.atmosphere}>
        <View style={styles.meshA} />
        <View style={styles.meshB} />
      </View>

      <FlatList
        data={items}
        keyExtractor={itemKey}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>History</Text>
              <Text style={styles.subtitle}>
                {items.length} captures recorded
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const k = itemKey(item);
          const isPlaying = playingKey === k;
          const isSpeaking = speakingKey === k;

          return (
            <View style={styles.card}>
              <View style={styles.cardInfo}>
                <View style={styles.intentRow}>
                  <Text style={styles.intentText} numberOfLines={2}>
                    {item.intentLabel}
                  </Text>
                  {item.source === "backend" && (
                    <View style={styles.cloudBadge}>
                      <Ionicons
                        name="cloud-done"
                        size={12}
                        color={colors.accent}
                      />
                    </View>
                  )}
                </View>
                <Text style={styles.dateText}>
                  {formatWhen(item.createdAt)}
                </Text>
              </View>

              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => onSpeakItem(item)}
                  disabled={speakingKey !== null || playingKey !== null}
                  style={({ pressed }) => [
                    styles.btnSecondary,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Ionicons
                    name="volume-medium-outline"
                    size={18}
                    color={colors.text}
                  />
                  <Text style={styles.btnText}>
                    {isSpeaking ? "..." : "Speak"}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => onPlayItem(item)}
                  disabled={speakingKey !== null}
                  style={({ pressed }) => [
                    styles.btnPrimary,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Ionicons
                    name={isPlaying ? "pause" : "play"}
                    size={16}
                    color={primaryTextColor}
                  />
                  <Text style={[styles.btnText, { color: primaryTextColor }]}>
                    {isPlaying ? "Stop" : "Original"}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </LinearGradient>
  );
}

const makeStyles = (colors: ThemeColors, mode: "light" | "dark") => {
  const meshA =
    mode === "dark" ? "rgba(143,208,255,0.05)" : "rgba(47,111,237,0.08)";
  const meshB =
    mode === "dark" ? "rgba(128,152,255,0.03)" : "rgba(120,140,200,0.06)";
  const cardFill =
    mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.7)";
  const cardBorder =
    mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(11,16,32,0.08)";
  const buttonFill =
    mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(11,16,32,0.04)";
  const buttonBorder =
    mode === "dark" ? "rgba(255,255,255,0.1)" : "rgba(11,16,32,0.12)";

  return StyleSheet.create({
  container: { flex: 1 },
  atmosphere: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  meshA: {
    position: "absolute",
    top: -50,
    right: -50,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: meshA,
  },
  meshB: {
    position: "absolute",
    bottom: 100,
    left: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: meshB,
  },
  listContent: { paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -0.5,
  },
  subtitle: { fontSize: 14, color: colors.textDim, marginTop: 2 },
  card: {
    backgroundColor: cardFill,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: cardBorder,
  },
  cardInfo: { marginBottom: 16 },
  intentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  intentText: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    flex: 1,
    lineHeight: 24,
  },
  cloudBadge: {
    padding: 4,
    borderRadius: 8,
    backgroundColor:
      mode === "dark" ? "rgba(143,208,255,0.1)" : "rgba(47,111,237,0.12)",
  },
  dateText: {
    fontSize: 12,
    color: colors.textDim,
    marginTop: 6,
    fontWeight: "500",
  },
  actionRow: { flexDirection: "row", gap: 12 },
  btnPrimary: {
    flex: 1.2,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  btnSecondary: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: buttonFill,
    borderWidth: 1,
    borderColor: buttonBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  btnText: { fontSize: 14, fontWeight: "700", color: colors.text },
  });
};
