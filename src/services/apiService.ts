const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!API_BASE) {
  throw new Error(
    "Missing EXPO_PUBLIC_API_BASE_URL. Add it to .env (Expo public env var)."
  );
}

// --------------------
// Presign
// --------------------
export async function getPresignedUrl(deviceId: string) {
  const res = await fetch(`${API_BASE}/presign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, contentType: "audio/m4a" }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`presign failed: ${res.status} ${text}`);
  }

  return (await res.json()) as {
    uploadUrl: string;
    key: string;
    bucket: string;
  };
}

// --------------------
// Recordings
// --------------------
export type CreateRecordingRequest = {
  deviceId: string;
  recordingId: string;
  s3Key: string;
  confirmedIntent: string;
  durationSeconds?: number;
  createdAt?: string; // ISO string
  transcript?: string | null;
};

export type CreateRecordingResponse = {
  ok: true;
  pk: string;
  sk: string;
};

export async function createRecording(
  payload: CreateRecordingRequest,
): Promise<CreateRecordingResponse> {
  const res = await fetch(`${API_BASE}/recordings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`createRecording failed: ${res.status} ${text}`);
  }

  return (await res.json()) as CreateRecordingResponse;
}

export type RecordingItem = {
  pk: string;
  sk: string;
  entityType?: string;
  deviceId: string;
  recordingId: string;
  s3Key: string;
  confirmedIntent: string;
  durationSeconds?: number | null;
  transcript?: string | null;
  createdAt: string;
  savedAt?: string;
};

export type ListRecordingsResponse = {
  ok: true;
  items: RecordingItem[];
};

export async function listRecordings(
  deviceId: string,
): Promise<ListRecordingsResponse> {
  const url = `${API_BASE}/recordings?deviceId=${encodeURIComponent(deviceId)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`listRecordings failed: ${res.status} ${text}`);
  }

  return (await res.json()) as ListRecordingsResponse;
}

// --------------------
// Presign GET (playback)
// --------------------
export async function getPresignedDownloadUrl(key: string) {
  const res = await fetch(
    `${API_BASE}/presign-get?key=${encodeURIComponent(key)}`,
    { method: "GET" },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`presign-get failed: ${res.status} ${text}`);
  }

  return (await res.json()) as { ok: true; downloadUrl: string };
}

// --------------------
// Intents
// --------------------
export type IntentItem = {
  intentId: string;
  label: string;
  createdAt?: string;
  updatedAt?: string;
};

export async function listIntents(deviceId: string) {
  const res = await fetch(
    `${API_BASE}/intents?deviceId=${encodeURIComponent(deviceId)}`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`listIntents failed: ${res.status} ${text}`);
  }
  return (await res.json()) as { ok: true; items: IntentItem[] };
}

export async function createIntent(
  deviceId: string,
  intentId: string,
  label: string,
) {
  const res = await fetch(`${API_BASE}/intents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, intentId, label }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`createIntent failed: ${res.status} ${text}`);
  }
  return (await res.json()) as { ok: true; intentId: string };
}

export async function deleteIntent(deviceId: string, intentId: string) {
  const res = await fetch(
    `${API_BASE}/intents?deviceId=${encodeURIComponent(
      deviceId,
    )}&intentId=${encodeURIComponent(intentId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`deleteIntent failed: ${res.status} ${text}`);
  }
  return (await res.json()) as { ok: true };
}

// --------------------
// Speech (TTS)
// --------------------
export async function speakText(deviceId: string, text: string) {
  const res = await fetch(`${API_BASE}/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, text }),
  });

  if (!res.ok) {
    const textRes = await res.text();
    throw new Error(`speak failed: ${res.status} ${textRes}`);
  }

  return (await res.json()) as {
    ok: true;
    key: string;
    downloadUrl: string;
    voiceId: string;
  };
}

// --------------------
// Backend should implement POST /transcribe { deviceId, s3Key } -> { transcript }
// --------------------
export async function transcribeFromS3(deviceId: string, s3Key: string) {
  const res = await fetch(`${API_BASE}/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, s3Key }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`transcribe failed: ${res.status} ${text}`);
  }

  return (await res.json()) as { ok: true; transcript: string };
}

// --------------------
// Match (intent suggestions)
// --------------------
export type MatchResponse = {
  ok: true;
  suggestions: { intentId: string; label: string; score: number }[];
};

export async function matchIntents(
  deviceId: string,
  transcript: string,
  topK = 3,
) {
  const res = await fetch(`${API_BASE}/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, transcript, topK }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`match failed: ${res.status} ${text}`);
  }

  return (await res.json()) as MatchResponse;
}

// --------------------
// AI Suggest Intent (when no matches or low scores)
// --------------------
export type SuggestIntentResponse = {
  ok: true;
  suggestion: {
    label: string;
    confidence: string;
  };
};

export async function suggestIntent(transcript: string) {
  const res = await fetch(`${API_BASE}/suggest-intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`suggest-intent failed: ${res.status} ${text}`);
  }

  return (await res.json()) as SuggestIntentResponse;
}