const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TABLE = process.env.INTENT_RECORDS_TABLE;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";

exports.handler = async (event) => {
  try {
    if (!TABLE) return resp(500, { error: "Missing INTENT_RECORDS_TABLE" });

    const method = (event.httpMethod || "").toUpperCase();

    if (method === "GET") return await handleGet(event);
    if (method === "POST") return await handlePost(event);
    if (method === "DELETE") return await handleDelete(event);

    return resp(405, { error: `Method not allowed: ${method}` });
  } catch (err) {
    console.error("IntentsFunction error:", err);
    return resp(500, { error: "Server error" });
  }
};

async function handleGet(event) {
  const qs = event.queryStringParameters || {};
  const deviceId = qs.deviceId;
  if (!deviceId) return resp(400, { error: "Missing deviceId query param" });

  const pk = `USER#${deviceId}`;

  const out = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":prefix": "INTENT#",
      },
      ScanIndexForward: true,
    }),
  );

  const items = (out.Items || []).map((i) => ({
    intentId: i.intentId,
    label: i.label,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt || i.createdAt,
  }));

  return resp(200, { ok: true, items });
}

async function handlePost(event) {
  const body = safeJson(event.body);
  if (!body) return resp(400, { error: "Invalid JSON body" });

  const { deviceId, intentId, label } = body;
  if (!deviceId || !intentId || !label) {
    return resp(400, { error: "Missing required fields: deviceId, intentId, label" });
  }

  if (!OPENAI_KEY) return resp(500, { error: "Missing OPENAI_API_KEY" });

  const now = new Date().toISOString();
  const pk = `USER#${deviceId}`;
  const sk = `INTENT#${intentId}`;

  // Embed label once, store it
  const embedding = await embedText(label);

  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        pk,
        sk,
        entityType: "INTENT",
        deviceId,
        intentId,
        label,
        embedding, // float[]
        createdAt: now,
        updatedAt: now,
      },
    }),
  );

  return resp(200, { ok: true, intentId });
}

async function handleDelete(event) {
  const qs = event.queryStringParameters || {};
  const deviceId = qs.deviceId;
  const intentId = qs.intentId;

  if (!deviceId || !intentId) {
    return resp(400, { error: "Missing deviceId or intentId query param" });
  }

  const pk = `USER#${deviceId}`;
  const sk = `INTENT#${intentId}`;

  await ddb.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { pk, sk },
    }),
  );

  return resp(200, { ok: true });
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

function resp(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "OPTIONS,GET,POST,DELETE",
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
