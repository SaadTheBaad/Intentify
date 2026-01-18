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
import { useTheme } from "../../src/context/ThemeContext";

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

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortKey(key: string, max = 42) {
  if (key.length <= max) return key;
  return key.slice(0, 18) + "…" + key.slice(-18);
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

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

        merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setItems(merged);
        return;
      } catch (backendErr: any) {
        setItems(localItems);
        setError(
          `Backend unavailable, showing local history. (${backendErr?.message ?? "error"})`
        );
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load history");
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
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

  const itemKey = useCallback((item: UiItem) => `${item.source}:${item.id}`, []);

  const onPlayItem = async (item: UiItem) => {
    const k = itemKey(item);

    try {
      setError(null);
      setPlayingKey(k);

      await stopPlayback();

      if (item.audioUri) {
        await playRecording(item.audioUri);
        return;
      }

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
    [playingKey, speakingKey]
  );

  return (
    <LinearGradient
      colors={colors.bgGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.container,
        {
          paddingTop: insets.top + 14,
          paddingBottom: Math.max(insets.bottom, 18) + 110, 
        },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.appIcon, { backgroundColor: colors.iconBg, borderColor: colors.iconBorder }]}>
            <Ionicons name="time" size={18} color={isDark ? "#D7E3FF" : "#2D5BD8"} />
          </View>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>History</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Your recent recordings and intents</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            onPress={onStopAudio}
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: colors.iconBg, borderColor: colors.iconBorder },
              pressed && { opacity: 0.85 }
            ]}
          >
            <Ionicons name="square" size={18} color={isDark ? "#D7E3FF" : "#2D5BD8"} />
            <Text style={[styles.iconBtnText, { color: colors.text }]}>Stop</Text>
          </Pressable>

          <Pressable
            onPress={onClear}
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: colors.iconBg, borderColor: colors.iconBorder },
              pressed && { opacity: 0.85 }
            ]}
          >
            <Ionicons name="trash" size={18} color="#FFD1D1" />
            <Text style={[styles.iconBtnText, { color: "#FFD1D1" }]}>Clear</Text>
          </Pressable>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="warning" size={16} color="#FFD1D1" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 12 }}
        data={items}
        keyExtractor={(item) => `${item.source}:${item.id}`}
        ListEmptyComponent={
          <View style={[styles.empty, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <Ionicons name="time-outline" size={22} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No history yet</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Record something on Home to see it here.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const k = itemKey(item);
          const isPlayingThis = playingKey === k;
          const isSpeakingThis = speakingKey === k;

          const sourceLabel = item.source === "backend" ? "cloud" : "local";

          return (
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
              <View style={styles.cardTopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.intent, { color: colors.text }]} numberOfLines={1}>
                    {item.intentLabel || "Untitled"}
                  </Text>

                  <View style={styles.metaRow}>
                    <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                    <Text style={[styles.metaText, { color: colors.textSecondary }]}>{formatWhen(item.createdAt)}</Text>

                    <View style={[styles.chip, { backgroundColor: colors.chipBg, borderColor: colors.chipBorder }]}>
                      <Ionicons
                        name={item.source === "backend" ? "cloud-outline" : "phone-portrait-outline"}
                        size={12}
                        color={isDark ? "#D7E3FF" : "#2D5BD8"}
                      />
                      <Text style={[styles.chipText, { color: colors.text }]}>{sourceLabel}</Text>
                    </View>
                  </View>

                  {item.s3Key ? (
                    <Text style={[styles.s3, { color: colors.textSecondary }]} numberOfLines={1}>
                      {shortKey(item.s3Key)}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.actionsRow}>
                <Pressable
                  onPress={() => onSpeakItem(item)}
                  disabled={isBusy}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    { backgroundColor: colors.actionBtnBg, borderColor: colors.actionBtnBorder },
                    isBusy && styles.actionBtnDisabled,
                    pressed && !isBusy && { opacity: 0.88 },
                  ]}
                >
                  <Ionicons name="volume-high" size={18} color={isDark ? "#D7E3FF" : "#2D5BD8"} />
                  <Text style={[styles.actionText, { color: colors.text }]}>
                    {isSpeakingThis ? "Speaking…" : "Speak"}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => onPlayItem(item)}
                  disabled={isBusy}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    { backgroundColor: colors.actionBtnBg, borderColor: colors.actionBtnBorder },
                    isBusy && styles.actionBtnDisabled,
                    pressed && !isBusy && { opacity: 0.88 },
                  ]}
                >
                  <Ionicons name="play" size={18} color={isDark ? "#D7E3FF" : "#2D5BD8"} />
                  <Text style={[styles.actionText, { color: colors.text }]}>
                    {isPlayingThis ? "Loading…" : "Play"}
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

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 18 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
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
  title: { color: "#EAF0FF", fontSize: 22, fontWeight: "900" },
  subtitle: { color: "rgba(234,240,255,0.60)", fontSize: 12, marginTop: 2 },

  headerActions: { flexDirection: "row", gap: 10 },
  iconBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(215,227,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(215,227,255,0.14)",
  },
  iconBtnText: { color: "#D7E3FF", fontSize: 13, fontWeight: "800" },

  errorBox: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,92,92,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,92,92,0.22)",
  },
  errorText: { flex: 1, color: "#FFE9E9", fontSize: 12, fontWeight: "700" },

  empty: {
    marginTop: 32,
    borderRadius: 22,
    padding: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { color: "#EAF0FF", fontWeight: "900", fontSize: 16, marginTop: 4 },
  emptyText: { color: "rgba(234,240,255,0.65)", fontSize: 12, textAlign: "center" },

  card: {
    marginBottom: 12,
    borderRadius: 22,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },

  cardTopRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },

  intent: { color: "#EAF0FF", fontSize: 16, fontWeight: "900" },

  metaRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  metaText: { color: "rgba(234,240,255,0.65)", fontSize: 12 },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipCloud: {
    backgroundColor: "rgba(215,227,255,0.10)",
    borderColor: "rgba(215,227,255,0.14)",
  },
  chipLocal: {
    backgroundColor: "rgba(215,227,255,0.08)",
    borderColor: "rgba(215,227,255,0.12)",
  },
  chipText: { color: "#D7E3FF", fontSize: 12, fontWeight: "800" },

  s3: {
    marginTop: 8,
    color: "rgba(234,240,255,0.45)",
    fontSize: 12,
  },

  actionsRow: { marginTop: 14, flexDirection: "row", gap: 10 },
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
});
