import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { startRecording, stopRecording } from "../../src/services/audioService";

const COLORS = {
  ink: "#0B0E16",
  night: "#0B0F1F",
  deep: "#10162C",
  haze: "#141A33",
  mist: "rgba(255,255,255,0.08)",
  line: "rgba(255,255,255,0.12)",
  softLine: "rgba(255,255,255,0.08)",
  accent: "#8FD0FF",
  live: "#FF6B6B",
  text: "#EAF1FF",
  textDim: "rgba(234,241,255,0.68)",
  textSoft: "rgba(234,241,255,0.52)",
  chipIdle: "rgba(143,208,255,0.10)",
  chipLive: "rgba(255,107,107,0.16)",
};

const TYPE = {
  hero: 24,
  title: 20,
  body: 14,
  small: 12,
};

const SPACING = {
  xs: 6,
  s: 10,
  m: 14,
  l: 18,
  xl: 24,
  xxl: 32,
};

const RADII = {
  s: 10,
  m: 16,
  l: 22,
  xl: 28,
  round: 999,
};

const MOTION = {
  quick: 140,
  base: 280,
  slow: 560,
};

const normalizeMetering = (metering: number | null) => {
  if (metering === null || Number.isNaN(metering)) return 0;
  const clamped = Math.max(-60, Math.min(0, metering));
  return (clamped + 60) / 60;
};

const formatElapsed = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const BAR_COUNT = 36;

export default function RecordScreen() {
  const insets = useSafeAreaInsets();
  const [isRecording, setIsRecording] = useState(false);
  const [lastUri, setLastUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Animations ---
  const scale = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const introHeader = useRef(new Animated.Value(0)).current;
  const introCard = useRef(new Animated.Value(0)).current;
  const introFooter = useRef(new Animated.Value(0)).current;
  const statusAnim = useRef(new Animated.Value(0)).current;
  const wave = useRef(new Animated.Value(0)).current;

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
      ]),
    );
  }, [pulse]);

  useEffect(() => {
    Animated.stagger(120, [
      Animated.timing(introHeader, {
        toValue: 1,
        duration: MOTION.slow,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(introCard, {
        toValue: 1,
        duration: MOTION.slow,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(introFooter, {
        toValue: 1,
        duration: MOTION.base,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [introCard, introFooter, introHeader]);

  useEffect(() => {
    if (isRecording) {
      pulseAnim.start();
    } else {
      pulseAnim.stop();
      pulse.setValue(0);
      wave.setValue(0);
    }

    Animated.timing(statusAnim, {
      toValue: isRecording ? 1 : 0,
      duration: MOTION.base,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [isRecording, pulse, pulseAnim, statusAnim, wave]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    timerRef.current = setInterval(() => {
      if (!startedAtRef.current) return;
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 200);
  };

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    startedAtRef.current = null;
  };

  const onRecordPress = async () => {
    setError(null);
    try {
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 0.97,
          duration: 90,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
      ]).start();

      if (!isRecording) {
        startTimer();
        await startRecording({
          onMetering: (metering) => {
            const normalized = normalizeMetering(metering);
            Animated.timing(wave, {
              toValue: normalized,
              duration: 120,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }).start();
          },
        });
        setIsRecording(true);
      } else {
        const res = await stopRecording();
        setIsRecording(false);
        setLastUri(res.uri);
        stopTimer();

        router.push({
          pathname: "/confirm",
          params: { uri: res.uri },
        });
      }
    } catch (e: any) {
      setIsRecording(false);
      stopTimer();
      setError(e?.message ?? "Recording error");
    }
  };

  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.22],
  });

  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0],
  });

  const barFactors = useMemo(() => {
    return Array.from({ length: BAR_COUNT }, (_, index) => {
      const phase = (index / (BAR_COUNT - 1)) * Math.PI;
      const curve = Math.sin(phase);
      const wobble = 0.22 * Math.sin(index * 1.7);
      return 0.25 + curve * 0.9 + wobble;
    });
  }, []);

  const barHeights = useMemo(() => {
    return barFactors.map((factor) =>
      wave.interpolate({
        inputRange: [0, 1],
        outputRange: [6, 6 + factor * 36],
      }),
    );
  }, [barFactors, wave]);

  const waveOpacity = wave.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.95],
  });

  const headerTranslate = introHeader.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });

  const cardTranslate = introCard.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });

  const footerTranslate = introFooter.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
  });

  const statusScale = statusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.05],
  });

  return (
    <LinearGradient
      colors={[COLORS.night, COLORS.deep, COLORS.night]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.container,
        {
          paddingTop: insets.top + SPACING.l,
          paddingBottom: Math.max(insets.bottom, SPACING.l) + 100,
        },
      ]}
    >
      <View pointerEvents="none" style={styles.atmosphere}>
        <View style={styles.meshA} />
        <View style={styles.meshB} />
        <View style={styles.meshC} />
        <LinearGradient
          colors={["rgba(255,255,255,0.08)", "transparent", "rgba(0,0,0,0.35)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.vignette}
        />
      </View>

      {/* Header */}
      <Animated.View
        style={[
          styles.header,
          {
            opacity: introHeader,
            transform: [{ translateY: headerTranslate }],
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <View style={styles.appIcon}>
            <Ionicons name="sparkles" size={18} color={COLORS.accent} />
          </View>
          <View>
            <Text style={styles.title}>Intentify</Text>
          </View>
        </View>

        <Animated.View
          style={[
            styles.chip,
            isRecording ? styles.chipLive : styles.chipIdle,
            { transform: [{ scale: statusScale }] },
          ]}
        >
          <Animated.View style={[styles.chipGlow, { opacity: statusAnim }]} />
          <View
            style={[styles.dot, isRecording ? styles.dotLive : styles.dotIdle]}
          />
          <Text style={styles.chipText}>
            {isRecording ? "Listening" : "Ready"}
          </Text>
        </Animated.View>
      </Animated.View>

      {/* Main Stage */}
      <Animated.View
        style={[
          styles.stage,
          {
            opacity: introCard,
            transform: [{ translateY: cardTranslate }],
          },
        ]}
      >
        <View style={styles.stageHeader}>
          <Text style={styles.cardTitle}>Tap to record</Text>
          <Text style={styles.cardHint}>
            Say it however you can. You’ll confirm the meaning on the next
            screen.
          </Text>
        </View>

        <View style={styles.recordZone}>
          <View style={styles.orbit} />
          <View style={styles.orbitInner} />
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
                pressed && { opacity: 0.92 },
              ]}
            >
              <Ionicons
                name={isRecording ? "stop" : "mic"}
                size={28}
                color={isRecording ? "#FFE9E9" : COLORS.text}
              />
              <Text style={styles.recordButtonText}>
                {isRecording ? "Stop" : "Record"}
              </Text>
            </Pressable>
          </Animated.View>
        </View>

        {/* Visualizer */}
        <View style={styles.visualizerHeader}>
          <View
            style={[
              styles.recDot,
              isRecording ? styles.recDotLive : styles.recDotIdle,
            ]}
          />
          <Text style={styles.timerText}>{formatElapsed(elapsedMs)}</Text>
          <Text style={styles.timerLabel}>{isRecording ? "REC" : "Ready"}</Text>
        </View>
        <Animated.View style={[styles.visualizer, { opacity: waveOpacity }]}>
          {barHeights.map((height, index) => (
            <Animated.View
              key={`bar-${index}`}
              style={[styles.visualizerBar, { height }]}
            />
          ))}
        </Animated.View>

        {/* Error */}
        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="warning" size={16} color="#FFD1D1" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </Animated.View>

      {/* Footer */}
      <Animated.Text
        style={[
          styles.footer,
          {
            opacity: introFooter,
            transform: [{ translateY: footerTranslate }],
          },
        ]}
      >
        Tip: A quieter space can help, but it’s okay if it’s not perfect.
      </Animated.Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: SPACING.l,
    justifyContent: "space-between",
  },
  atmosphere: {
    ...StyleSheet.absoluteFillObject,
  },
  meshA: {
    position: "absolute",
    top: -120,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 200,
    backgroundColor: "rgba(143,208,255,0.18)",
  },
  meshB: {
    position: "absolute",
    bottom: 120,
    left: -120,
    width: 280,
    height: 280,
    borderRadius: 220,
    backgroundColor: "rgba(255,107,107,0.12)",
  },
  meshC: {
    position: "absolute",
    bottom: -140,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 180,
    backgroundColor: "rgba(128,152,255,0.12)",
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
  },

  header: {
    marginTop: SPACING.s,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.s,
  },
  appIcon: {
    width: 40,
    height: 40,
    borderRadius: RADII.m,
    backgroundColor: "rgba(143,208,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(143,208,255,0.24)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: COLORS.text,
    fontSize: TYPE.hero,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    borderRadius: RADII.round,
    borderWidth: 1,
    overflow: "hidden",
  },
  chipIdle: {
    backgroundColor: COLORS.chipIdle,
    borderColor: "rgba(143,208,255,0.22)",
  },
  chipLive: {
    backgroundColor: COLORS.chipLive,
    borderColor: "rgba(255,107,107,0.32)",
  },
  chipGlow: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(255,107,107,0.25)",
  },
  dot: { width: 8, height: 8, borderRadius: RADII.round },
  dotIdle: { backgroundColor: "#7D8AA8" },
  dotLive: { backgroundColor: COLORS.live },
  chipText: { color: COLORS.text, fontSize: TYPE.small, fontWeight: "700" },

  stage: {
    marginTop: SPACING.l,
    borderRadius: RADII.xl,
    padding: SPACING.l,
    backgroundColor: "rgba(16,22,44,0.8)",
    borderWidth: 1,
    borderColor: COLORS.line,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
  },
  stageHeader: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.softLine,
    paddingBottom: SPACING.m,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: TYPE.title,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  cardHint: {
    marginTop: SPACING.xs,
    color: COLORS.textDim,
    fontSize: TYPE.body,
    lineHeight: 20,
  },

  recordZone: {
    marginTop: SPACING.xl,
    alignItems: "center",
    justifyContent: "center",
    height: 210,
  },
  orbit: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: RADII.round,
    borderWidth: 1,
    borderColor: "rgba(143,208,255,0.25)",
    borderStyle: "dashed",
  },
  orbitInner: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: RADII.round,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  pulseRing: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: RADII.round,
    borderWidth: 2,
    borderColor: "rgba(255, 107, 107, 0.7)",
  },

  recordButton: {
    width: 128,
    height: 128,
    borderRadius: RADII.round,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    borderWidth: 1,
  },
  recordButtonIdle: {
    backgroundColor: "rgba(143,208,255,0.14)",
    borderColor: "rgba(143,208,255,0.35)",
  },
  recordButtonLive: {
    backgroundColor: "rgba(255,107,107,0.22)",
    borderColor: "rgba(255,107,107,0.48)",
  },
  recordButtonText: {
    color: COLORS.text,
    fontSize: TYPE.small,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  visualizerHeader: {
    marginTop: SPACING.m,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: RADII.round,
  },
  recDotLive: {
    backgroundColor: COLORS.live,
  },
  recDotIdle: {
    backgroundColor: "rgba(234,241,255,0.35)",
  },
  timerText: {
    color: COLORS.text,
    fontSize: TYPE.body,
    fontWeight: "800",
    letterSpacing: 1,
  },
  timerLabel: {
    color: COLORS.textSoft,
    fontSize: TYPE.small,
    fontWeight: "700",
    letterSpacing: 1,
  },
  visualizer: {
    marginTop: SPACING.s,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 58,
    paddingHorizontal: SPACING.xs,
    borderRadius: RADII.m,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: COLORS.softLine,
  },
  visualizerBar: {
    width: 3,
    borderRadius: RADII.round,
    backgroundColor: "rgba(234,241,255,0.85)",
  },

  infoBox: {
    marginTop: SPACING.m,
    flexDirection: "row",
    gap: SPACING.s,
    alignItems: "center",
    padding: SPACING.m,
    borderRadius: RADII.m,
    backgroundColor: "rgba(143,208,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(143,208,255,0.16)",
  },
  infoText: { flex: 1, color: COLORS.textDim, fontSize: TYPE.small },

  errorBox: {
    marginTop: SPACING.s,
    flexDirection: "row",
    gap: SPACING.s,
    alignItems: "center",
    padding: SPACING.m,
    borderRadius: RADII.m,
    backgroundColor: "rgba(255,107,107,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,107,107,0.32)",
  },
  errorText: {
    flex: 1,
    color: "#FFE9E9",
    fontSize: TYPE.small,
    fontWeight: "700",
  },

  footer: {
    marginTop: SPACING.l,
    textAlign: "center",
    color: COLORS.textSoft,
    fontSize: TYPE.small,
  },
});
