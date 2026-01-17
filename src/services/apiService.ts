const API_BASE =
  "https://s4z4ahi4z0.execute-api.ca-central-1.amazonaws.com/prod";

// --------------------
// Presign
// --------------------
export async function getPresignedUrl(userId: string) {
  const res = await fetch(`${API_BASE}/presign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, contentType: "audio/m4a" }),
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
    `${API_BASE}/intents?deviceId=${encodeURIComponent(deviceId)}&intentId=${encodeURIComponent(intentId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`deleteIntent failed: ${res.status} ${text}`);
  }
  return (await res.json()) as { ok: true };
}

export async function speakText(
  deviceId: string,
  text: string,
  voiceId?: string,
) {
  const res = await fetch(`${API_BASE}/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, text, voiceId }),
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
