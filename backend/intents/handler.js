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

    const userSub = getUserSub(event);
    if (!userSub) return resp(401, { error: "Unauthorized" });

    const method = (event.httpMethod || event.requestContext?.http?.method || "").toUpperCase();

    if (method === "GET") return await handleGet(event, userSub);
    if (method === "POST") return await handlePost(event, userSub);
    if (method === "DELETE") return await handleDelete(event, userSub);

    return resp(405, { error: `Method not allowed: ${method}` });
  } catch (err) {
    console.error("IntentsFunction error:", err);
    return resp(500, { error: "Server error" });
  }
};

async function handleGet(event, userSub) {
  const pk = `USER#${userSub}`;

  const out = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":prefix": "INTENT#",
      },
      ScanIndexForward: true,
    })
  );

  const items = (out.Items || []).map((i) => ({
    intentId: i.intentId,
    label: i.label,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt || i.createdAt,
  }));

  return resp(200, { ok: true, items });
}

async function handlePost(event, userSub) {
  const body = safeJson(event.body);
  if (!body) return resp(400, { error: "Invalid JSON body" });

  const { intentId, label } = body;
  if (!intentId || !label) {
    return resp(400, { error: "Missing required fields: intentId, label" });
  }

  if (!OPENAI_KEY) return resp(500, { error: "Missing OPENAI_API_KEY" });

  const now = new Date().toISOString();
  const pk = `USER#${userSub}`;
  const sk = `INTENT#${intentId}`;

  const embedding = await embedText(label);

  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        pk,
        sk,
        entityType: "INTENT",
        intentId,
        label,
        embedding,
        createdAt: now,
        updatedAt: now,
      },
    })
  );

  return resp(200, { ok: true, intentId });
}

async function handleDelete(event, userSub) {
  const qs = event.queryStringParameters || {};
  const intentId = qs.intentId;

  if (!intentId) {
    return resp(400, { error: "Missing intentId query param" });
  }

  const pk = `USER#${userSub}`;
  const sk = `INTENT#${intentId}`;

  await ddb.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { pk, sk },
    })
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
