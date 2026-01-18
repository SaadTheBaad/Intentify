import { Audio } from "expo-av";

export type RecordingResult = {
  uri: string;
  durationMillis?: number;
};

export type MeteringCallback = (
  metering: number | null,
  status: Audio.RecordingStatus,
) => void;

let recording: Audio.Recording | null = null;
let sound: Audio.Sound | null = null;
let onMetering: MeteringCallback | null = null;

function withMeteringEnabled(
  options: Audio.RecordingOptions,
): Audio.RecordingOptions {
  return {
    ...options,
    android: {
      ...(options.android as any),
      isMeteringEnabled: true,
    },
    ios: {
      ...(options.ios as any),
      isMeteringEnabled: true,
    },
  };
}

export async function startRecording(options?: {
  onMetering?: MeteringCallback;
}) {
  const perm = await Audio.requestPermissionsAsync();
  if (!perm.granted) throw new Error("Microphone permission not granted");

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });

  const rec = new Audio.Recording();
  onMetering = options?.onMetering ?? null;

  if (onMetering) {
    rec.setProgressUpdateInterval(120);
    rec.setOnRecordingStatusUpdate((status) => {
      if (!status.isRecording) return;
      const metering =
        "metering" in status && typeof status.metering === "number"
          ? status.metering
          : null;
      onMetering?.(metering, status);
    });
  }

  const baseOptions = Audio.RecordingOptionsPresets.HIGH_QUALITY;
  await rec.prepareToRecordAsync(withMeteringEnabled(baseOptions));
  await rec.startAsync();
  recording = rec;
}

export async function stopRecording(): Promise<RecordingResult> {
  if (!recording) throw new Error("No active recording");

  const rec = recording;
  recording = null;
  onMetering = null;
  rec.setOnRecordingStatusUpdate(null);

  await rec.stopAndUnloadAsync();
  const uri = rec.getURI();
  if (!uri) throw new Error("No recording URI returned");

  const status = await rec.getStatusAsync();
  return {
    uri,
    durationMillis:
      "durationMillis" in status ? status.durationMillis : undefined,
  };
}

export async function playRecording(uri: string) {
  // Stop/unload any previous playback
  if (sound) {
    await sound.stopAsync();
    await sound.unloadAsync();
    sound = null;
  }

  // Ensure playback works on iOS even if silent switch is on
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
  });

  const { sound: newSound } = await Audio.Sound.createAsync(
    { uri },
    { shouldPlay: true },
  );
  sound = newSound;
}

export async function stopPlayback() {
  if (!sound) return;
  await sound.stopAsync();
  await sound.unloadAsync();
  sound = null;
}
