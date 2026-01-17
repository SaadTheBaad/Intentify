const API_BASE =
  "https://c2hpf2rbbj.execute-api.ca-central-1.amazonaws.com/prod";

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