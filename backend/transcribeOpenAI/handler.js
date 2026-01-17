const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

const s3 = new S3Client({});

exports.handler = async (event) => {
  try {
    const userSub = getUserSub(event);
    if (!userSub) return resp(401, { error: "Unauthorized" });

    const body = safeJson(event.body);
    if (!body) return resp(400, { error: "Invalid JSON body" });

    const { s3Key } = body;
    if (!s3Key) return resp(400, { error: "s3Key required" });

    const bucket = process.env.BUCKET_NAME;
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe";

    if (!bucket) return resp(500, { error: "Missing BUCKET_NAME" });
    if (!apiKey) return resp(500, { error: "Missing OPENAI_API_KEY" });

    // Optional but recommended: ensure users can only transcribe their own objects
    if (!String(s3Key).startsWith(`users/${userSub}/`)) {
      return resp(403, { error: "Forbidden (key not owned by user)" });
    }

    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: s3Key }));
    const audioBuf = await streamToBuffer(obj.Body);

    const form = new FormData();
    form.append("model", model);

    const blob = new Blob([audioBuf], { type: "audio/m4a" });
    form.append("file", blob, "audio.m4a");

    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });

    if (!r.ok) {
      const text = await r.text();
      console.error("OpenAI transcribe failed:", r.status, text);
      return resp(500, { error: `OpenAI transcribe failed: ${r.status}` });
    }

    const json = await r.json();
    const transcript = json?.text || "";

    return resp(200, { ok: true, transcript });
  } catch (err) {
    console.error("OpenAITranscribe error:", err);
    return resp(500, { error: "Server error" });
  }
};

function getUserSub(event) {
  const claims =
    event?.requestContext?.authorizer?.claims ||
    event?.requestContext?.authorizer?.jwt?.claims;
  return claims?.sub || null;
}

function resp(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(body),
  };
}

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,GET,POST,DELETE",
  };
}

function safeJson(str) {
  try {
    return JSON.parse(str || "{}");
  } catch {
    return null;
  }
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
