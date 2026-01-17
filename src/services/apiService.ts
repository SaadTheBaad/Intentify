import { getIdToken } from "./authService";

const API_BASE =
  "https://s4z4ahi4z0.execute-api.ca-central-1.amazonaws.com/prod";

// --------------------
// Auth helpers
// --------------------
async function authHeaders(): Promise<Record<string, string>> {
  const token = await getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function jsonHeaders(): Promise<Record<string, string>> {
  return { "Content-Type": "application/json", ...(await authHeaders()) };
}

// --------------------
// Presign (PUT upload)
// --------------------
export async function getPresignedUrl() {
  const res = await fetch(`${API_BASE}/presign`, {
    method: "POST",
    headers: await jsonHeaders(),
    body: JSON.stringify({ contentType: "audio/m4a" }),
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
// Presign GET (playback)
// --------------------
export async function getPresignedDownloadUrl(key: string) {
  const res = await fetch(
    `${API_BASE}/presign-get?key=${encodeURIComponent(key)}`,
    {
      method: "GET",
      headers: await authHeaders(),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`presign-get failed: ${res.status} ${text}`);
  }

  return (await res.json()) as { ok: true; downloadUrl: string };
}

// --------------------
// Recordings
// --------------------
export type CreateRecordingRequest = {
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
  payload: CreateRecordingRequest
): Promise<CreateRecordingResponse> {
  const res = await fetch(`${API_BASE}/recordings`, {
    method: "POST",
    headers: await jsonHeaders(),
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

export async function listRecordings(): Promise<ListRecordingsResponse> {
  const res = await fetch(`${API_BASE}/recordings`, {
    method: "GET",
    headers: await authHeaders(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`listRecordings failed: ${res.status} ${text}`);
  }

  return (await res.json()) as ListRecordingsResponse;
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

export async function listIntents() {
  const res = await fetch(`${API_BASE}/intents`, {
    method: "GET",
    headers: await authHeaders(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`listIntents failed: ${res.status} ${text}`);
  }

  return (await res.json()) as { ok: true; items: IntentItem[] };
}

export async function createIntent(intentId: string, label: string) {
  const res = await fetch(`${API_BASE}/intents`, {
    method: "POST",
    headers: await jsonHeaders(),
    body: JSON.stringify({ intentId, label }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`createIntent failed: ${res.status} ${text}`);
  }

  return (await res.json()) as { ok: true; intentId: string };
}

export async function deleteIntent(intentId: string) {
  const res = await fetch(
    `${API_BASE}/intents?intentId=${encodeURIComponent(intentId)}`,
    { method: "DELETE", headers: await authHeaders() }
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
export async function speakText(text: string) {
  const res = await fetch(`${API_BASE}/speak`, {
    method: "POST",
    headers: await jsonHeaders(),
    body: JSON.stringify({ text }),
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
// OpenAI Transcribe
// --------------------
export async function transcribeFromS3(s3Key: string) {
  const res = await fetch(`${API_BASE}/transcribe`, {
    method: "POST",
    headers: await jsonHeaders(),
    body: JSON.stringify({ s3Key }),
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

export async function matchIntents(transcript: string, topK = 3) {
  const res = await fetch(`${API_BASE}/match`, {
    method: "POST",
    headers: await jsonHeaders(),
    body: JSON.stringify({ transcript, topK }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`match failed: ${res.status} ${text}`);
  }

  return (await res.json()) as MatchResponse;
}
