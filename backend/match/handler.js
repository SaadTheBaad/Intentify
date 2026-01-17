const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TABLE = process.env.INTENT_RECORDS_TABLE;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";

exports.handler = async (event) => {
  try {
    const userSub = getUserSub(event);
    if (!userSub) return resp(401, { error: "Unauthorized" });

    const body = safeJson(event.body);
    if (!body) return resp(400, { error: "Invalid JSON body" });

    const { transcript, topK } = body;
    if (!transcript) {
      return resp(400, { error: "transcript required" });
    }

    if (!TABLE) return resp(500, { error: "Missing INTENT_RECORDS_TABLE" });
    if (!OPENAI_KEY) return resp(500, { error: "Missing OPENAI_API_KEY" });

    const intents = await listIntents(userSub);
    if (intents.length === 0) return resp(200, { ok: true, suggestions: [] });

    const tVec = await embedText(transcript);

    const scored = intents
      .map((it) => {
        const iVec = it.embedding;
        const score = Array.isArray(iVec) ? cosineSimilarity(tVec, iVec) : -1;
        return { intentId: it.intentId, label: it.label, score };
      })
      .filter((x) => x.score >= 0);

    scored.sort((a, b) => b.score - a.score);

    const k = typeof topK === "number" ? topK : 3;
    return resp(200, { ok: true, suggestions: scored.slice(0, k) });
  } catch (err) {
    console.error("Match error:", err);
    return resp(500, { error: "Server error" });
  }
};

async function listIntents(userSub) {
  const pk = `USER#${userSub}`;
  const out = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :p)",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":p": "INTENT#",
      },
    })
  );

  return (out.Items || [])
    .map((x) => ({
      intentId: x.intentId || String(x.sk || "").replace("INTENT#", ""),
      label: x.label,
      embedding: x.embedding,
    }))
    .filter((x) => !!x.label && Array.isArray(x.embedding));
}

async function embedText(text) {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: text,
    }),
  });

  if (!r.ok) {
    const t = await r.text();
    console.error("OpenAI embeddings failed:", r.status, t);
    throw new Error(`embeddings failed: ${r.status}`);
  }

  const json = await r.json();
  const vec = json?.data?.[0]?.embedding;
  if (!Array.isArray(vec)) throw new Error("No embedding returned");
  return vec;
}

function cosineSimilarity(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
}

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
