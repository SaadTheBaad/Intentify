const {
  PollyClient,
  SynthesizeSpeechCommand,
} = require("@aws-sdk/client-polly");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const polly = new PollyClient({});
const s3 = new S3Client({});

exports.handler = async (event) => {
  try {
    const bucket = process.env.BUCKET_NAME;
    if (!bucket) return resp(500, { error: "Missing BUCKET_NAME" });

    const body = safeJson(event.body);
    if (!body) return resp(400, { error: "Invalid JSON body" });

    const { deviceId, text, voiceId } = body;
    if (!deviceId || !text) {
      return resp(400, { error: "Missing required fields: deviceId, text" });
    }

    const nowIso = new Date().toISOString();
    const safeText = String(text).slice(0, 1200); // Polly limit safety
    const voice = voiceId || "Joanna";

    const synth = await polly.send(
      new SynthesizeSpeechCommand({
        OutputFormat: "mp3",
        Text: safeText,
        VoiceId: voice,
      }),
    );

    const audioBytes = await streamToBuffer(synth.AudioStream);
    const key = `tts/${deviceId}/${nowIso}.mp3`;

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: audioBytes,
        ContentType: "audio/mpeg",
      }),
    );

    // Return a short-lived URL for playback
    const downloadUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: 60 },
    );

    return resp(200, { ok: true, key, downloadUrl, voiceId: voice });
  } catch (err) {
    console.error("SpeakFunction error:", err);
    return resp(500, { error: "Server error" });
  }
};

function resp(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "OPTIONS,POST",
    },
    body: JSON.stringify(body),
  };
}

function safeJson(str) {
  try {
    return JSON.parse(str || "{}");
  } catch {
    return null;
  }
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}
