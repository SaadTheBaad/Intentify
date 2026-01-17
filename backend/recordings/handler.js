const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

exports.handler = async (event) => {
  try {
    const tableName = process.env.INTENT_RECORDS_TABLE;
    if (!tableName) {
      return resp(500, { error: "Missing INTENT_RECORDS_TABLE env var" });
    }

    const userSub = getUserSub(event);
    if (!userSub) return resp(401, { error: "Unauthorized" });

    const method = (event.httpMethod || event.requestContext?.http?.method || "").toUpperCase();

    // -------------------------
    // GET /recordings
    // -------------------------
    if (method === "GET") {
      const pk = `USER#${userSub}`;

      const result = await ddb.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "pk = :pk",
          ExpressionAttributeValues: { ":pk": pk },
          ScanIndexForward: false,
          Limit: 50,
        })
      );

      // Only return recordings
      const items = (result.Items || []).filter(
        (x) => (x.entityType || "RECORDING") === "RECORDING"
      );

      return resp(200, { ok: true, items });
    }

    // -------------------------
    // POST /recordings
    // -------------------------
    if (method === "POST") {
      const body = safeJson(event.body);
      if (!body) return resp(400, { error: "Invalid JSON body" });

      const {
        recordingId,
        s3Key,
        confirmedIntent,
        durationSeconds,
        createdAt,
        transcript,
      } = body;

      if (!recordingId || !s3Key || !confirmedIntent) {
        return resp(400, {
          error:
            "Missing required fields: recordingId, s3Key, confirmedIntent",
        });
      }

      const nowIso = new Date().toISOString();
      const createdIso = createdAt ? new Date(createdAt).toISOString() : nowIso;

      const pk = `USER#${userSub}`;
      const sk = `TS#${createdIso}#REC#${recordingId}`;

      const item = {
        pk,
        sk,
        recordingId,
        s3Key,
        confirmedIntent,
        durationSeconds:
          typeof durationSeconds === "number" ? durationSeconds : null,
        transcript: transcript || null,
        createdAt: createdIso,
        savedAt: nowIso,
        entityType: "RECORDING",
      };

      await ddb.send(
        new PutCommand({
          TableName: tableName,
          Item: item,
        })
      );

      return resp(200, { ok: true, pk, sk });
    }

    return resp(405, { error: `Method not allowed: ${method}` });
  } catch (err) {
    console.error("RecordingsFunction error:", err);
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
    "Access-Control-Allow-Methods": "OPTIONS,GET,POST",
  };
}

function safeJson(str) {
  try {
    return JSON.parse(str || "{}");
  } catch {
    return null;
  }
}
