import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  playRecording,
  startRecording,
  stopPlayback,
  stopRecording,
} from "../../src/services/audioService";

export default function RecordScreen() {
  const insets = useSafeAreaInsets();
  const [isRecording, setIsRecording] = useState(false);
  const [lastUri, setLastUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- Animations ---
  const scale = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  const pulseAnim = useMemo(() => {
    return Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
  }, [pulse]);

  useEffect(() => {
    if (isRecording) {
      pulseAnim.start();
    } else {
      pulseAnim.stop();
      pulse.setValue(0);
    }
  }, [isRecording]);

  const onRecordPress = async () => {
    setError(null);
    try {
      Animated.sequence([
        Animated.timing(scale, { toValue: 0.97, duration: 90, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }),
      ]).start();

      if (!isRecording) {
        await startRecording();
        setIsRecording(true);
      } else {
        const res = await stopRecording();
        setIsRecording(false);
        setLastUri(res.uri);

        router.push({
          pathname: "/confirm",
          params: { uri: res.uri },
        });
      }
    } catch (e: any) {
      setIsRecording(false);
      setError(e?.message ?? "Recording error");
    }
  };

  const onPlayPress = async () => {
    if (!lastUri) return;
    setError(null);
    try {
      await playRecording(lastUri);
    } catch (e: any) {
      setError(e?.message ?? "Playback error");
    }
  };

  const onStopPress = async () => {
    setError(null);
    try {
      await stopPlayback();
    } catch (e: any) {
      setError(e?.message ?? "Stop playback error");
    }
  };

  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.18],
  });

  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0],
  });

  return (
    <LinearGradient
      colors={["#0B1020", "#0E1731", "#0A0F1F"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.container,
        {
          paddingTop: insets.top + 18,
          paddingBottom: Math.max(insets.bottom, 18) + 100,
        },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.appIcon}>
            <Ionicons name="sparkles" size={18} color="#D7E3FF" />
          </View>
          <View>
            <Text style={styles.title}>Intentify</Text>
            <Text style={styles.subtitle}>Record → confirm intent → upload</Text>
          </View>
        </View>

        <View style={[styles.chip, isRecording ? styles.chipLive : styles.chipIdle]}>
          <View style={[styles.dot, isRecording ? styles.dotLive : styles.dotIdle]} />
          <Text style={styles.chipText}>{isRecording ? "Recording" : "Ready"}</Text>
        </View>
      </View>

      {/* Main Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Tap to record</Text>
        <Text style={styles.cardHint}>
          Keep it short and clear. You’ll review it on the next screen.
        </Text>

        <View style={styles.recordZone}>
          {/* Pulse ring (only visible while recording) */}
          {isRecording ? (
            <Animated.View
              style={[
                styles.pulseRing,
                { transform: [{ scale: ringScale }], opacity: ringOpacity },
              ]}
            />
          ) : null}

          <Animated.View style={{ transform: [{ scale }] }}>
            <Pressable
              onPress={onRecordPress}
              style={({ pressed }) => [
                styles.recordButton,
                isRecording ? styles.recordButtonLive : styles.recordButtonIdle,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Ionicons
                name={isRecording ? "stop" : "mic"}
                size={28}
                color={isRecording ? "#FFE9E9" : "#EAF0FF"}
              />
              <Text style={styles.recordButtonText}>
                {isRecording ? "Stop" : "Record"}
              </Text>
            </Pressable>
          </Animated.View>
        </View>

        {/* Secondary Actions */}
        <View style={styles.actionsRow}>
          <Pressable
            onPress={onPlayPress}
            disabled={!lastUri}
            style={({ pressed }) => [
              styles.actionBtn,
              !lastUri && styles.actionBtnDisabled,
              pressed && lastUri && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="play" size={18} color={lastUri ? "#D7E3FF" : "#5D6A88"} />
            <Text style={[styles.actionText, !lastUri && styles.actionTextDisabled]}>
              Play
            </Text>
          </Pressable>

          <Pressable
            onPress={onStopPress}
            style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="close" size={18} color="#D7E3FF" />
            <Text style={styles.actionText}>Stop</Text>
          </Pressable>
        </View>

        {/* Info */}
        {lastUri ? (
          <View style={styles.infoBox}>
            <Ionicons name="document-text" size={16} color="#BFD2FF" />
            <Text style={styles.infoText} numberOfLines={2}>
              Last saved: {lastUri}
            </Text>
          </View>
        ) : (
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={16} color="#BFD2FF" />
            <Text style={styles.infoText}>
              No recording yet. Tap record to begin.
            </Text>
          </View>
        )}

        {/* Error */}
        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="warning" size={16} color="#FFD1D1" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </View>

      {/* Footer */}
      <Text style={styles.footer}>
        Tip: Record in a quiet spot for best results.
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 18,
    justifyContent: "space-between",
  },

  header: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  title: { color: "#EAF0FF", fontSize: 18, fontWeight: "800" },
  subtitle: { color: "rgba(234,240,255,0.65)", fontSize: 12, marginTop: 2 },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipIdle: {
    backgroundColor: "rgba(215,227,255,0.10)",
    borderColor: "rgba(215,227,255,0.14)",
  },
  chipLive: {
    backgroundColor: "rgba(255,99,99,0.14)",
    borderColor: "rgba(255,99,99,0.28)",
  },
  dot: { width: 8, height: 8, borderRadius: 99 },
  dotIdle: { backgroundColor: "#7D8AA8" },
  dotLive: { backgroundColor: "#FF5C5C" },
  chipText: { color: "#EAF0FF", fontSize: 12, fontWeight: "700" },

  card: {
    marginTop: 18,
    borderRadius: 22,
    padding: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  cardTitle: { color: "#EAF0FF", fontSize: 20, fontWeight: "800" },
  cardHint: {
    marginTop: 6,
    color: "rgba(234,240,255,0.68)",
    fontSize: 13,
    lineHeight: 18,
  },

  recordZone: {
    marginTop: 18,
    alignItems: "center",
    justifyContent: "center",
    height: 190,
  },
  pulseRing: {
    position: "absolute",
    width: 132,
    height: 132,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "rgba(255, 92, 92, 0.65)",
  },

  recordButton: {
    width: 120,
    height: 120,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
  },
  recordButtonIdle: {
    backgroundColor: "rgba(215,227,255,0.12)",
    borderColor: "rgba(215,227,255,0.20)",
  },
  recordButtonLive: {
    backgroundColor: "rgba(255,92,92,0.20)",
    borderColor: "rgba(255,92,92,0.40)",
  },
  recordButtonText: {
    color: "#EAF0FF",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  actionsRow: {
    marginTop: 6,
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(215,227,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(215,227,255,0.14)",
  },
  actionBtnDisabled: {
    backgroundColor: "rgba(215,227,255,0.04)",
    borderColor: "rgba(215,227,255,0.08)",
  },
  actionText: { color: "#D7E3FF", fontWeight: "800", fontSize: 14 },
  actionTextDisabled: { color: "#5D6A88" },

  infoBox: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(191,210,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(191,210,255,0.10)",
  },
  infoText: { flex: 1, color: "rgba(234,240,255,0.75)", fontSize: 12 },

  errorBox: {
    marginTop: 10,
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

  footer: {
    marginTop: 12,
    textAlign: "center",
    color: "rgba(234,240,255,0.55)",
    fontSize: 12,
  },
});
