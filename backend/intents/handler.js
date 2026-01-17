const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

exports.handler = async (event) => {
  try {
    const tableName = process.env.INTENT_RECORDS_TABLE;
    if (!tableName) return resp(500, { error: "Missing INTENT_RECORDS_TABLE" });

    const method = (event.httpMethod || "").toUpperCase();

    if (method === "GET") return await handleGet(event, tableName);
    if (method === "POST") return await handlePost(event, tableName);
    if (method === "DELETE") return await handleDelete(event, tableName);

    return resp(405, { error: `Method not allowed: ${method}` });
  } catch (err) {
    console.error("IntentsFunction error:", err);
    return resp(500, { error: "Server error" });
  }
};

async function handleGet(event, tableName) {
  const qs = event.queryStringParameters || {};
  const deviceId = qs.deviceId;
  if (!deviceId) return resp(400, { error: "Missing deviceId query param" });

  const pk = `USER#${deviceId}`;

  const out = await ddb.send(
    new QueryCommand({
      TableName: tableName,
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

async function handlePost(event, tableName) {
  const body = safeJson(event.body);
  if (!body) return resp(400, { error: "Invalid JSON body" });

  const { deviceId, intentId, label } = body;
  if (!deviceId || !intentId || !label) {
    return resp(400, {
      error: "Missing required fields: deviceId, intentId, label",
    });
  }

  const now = new Date().toISOString();
  const pk = `USER#${deviceId}`;
  const sk = `INTENT#${intentId}`;

  await ddb.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        pk,
        sk,
        entityType: "INTENT",
        deviceId,
        intentId,
        label,
        createdAt: now,
        updatedAt: now,
      },
    }),
  );

  return resp(200, { ok: true, intentId });
}

async function handleDelete(event, tableName) {
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
      TableName: tableName,
      Key: { pk, sk },
    }),
  );

  return resp(200, { ok: true });
}

function resp(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
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
