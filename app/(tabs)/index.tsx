import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  playRecording,
  startRecording,
  stopPlayback,
  stopRecording,
} from "../../src/services/audioService";

export default function RecordScreen() {
  const [isRecording, setIsRecording] = useState(false);
  const [lastUri, setLastUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onRecordPress = async () => {
    setError(null);
    try {
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

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        gap: 12,
      }}
    >
      <Text style={{ fontSize: 26, fontWeight: "700" }}>Record</Text>

      <Pressable
        onPress={onRecordPress}
        style={{
          paddingVertical: 14,
          paddingHorizontal: 22,
          borderRadius: 12,
          borderWidth: 1,
          minWidth: 140,
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 16 }}>{isRecording ? "Stop" : "Record"}</Text>
      </Pressable>

      {lastUri ? (
        <>
          <Pressable
            onPress={onPlayPress}
            style={{
              paddingVertical: 12,
              paddingHorizontal: 22,
              borderRadius: 12,
              borderWidth: 1,
              minWidth: 140,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 16 }}>Play</Text>
          </Pressable>

          <Pressable
            onPress={onStopPress}
            style={{
              paddingVertical: 12,
              paddingHorizontal: 22,
              borderRadius: 12,
              borderWidth: 1,
              minWidth: 140,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 16 }}>Stop</Text>
          </Pressable>

          <Text style={{ marginTop: 10, textAlign: "center" }}>
            Saved: {lastUri}
          </Text>
        </>
      ) : null}

      {error ? (
        <Text style={{ marginTop: 10, color: "red", textAlign: "center" }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}