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

    const method = event.httpMethod || event.requestContext?.http?.method;

    // -------------------------
    // GET /recordings?deviceId=...
    // -------------------------
    if (method === "GET") {
      const qs = event.queryStringParameters || {};
      const deviceId = qs.deviceId;

      if (!deviceId) {
        return resp(400, { error: "Missing deviceId query param" });
      }

      const pk = `USER#${deviceId}`;

      const result = await ddb.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
          ExpressionAttributeValues: {
            ":pk": pk,
            ":prefix": "TS#", // recordings only
          },
          ScanIndexForward: false, // newest first
          Limit: 50,
        })
      );

      return resp(200, { ok: true, items: result.Items || [] });
    }

    // -------------------------
    // POST /recordings
    // -------------------------
    if (method === "POST") {
      const body = safeJson(event.body);
      if (!body) return resp(400, { error: "Invalid JSON body" });

      const {
        deviceId,
        recordingId,
        s3Key,
        confirmedIntent,
        durationSeconds,
        createdAt,
        transcript,
      } = body;

      if (!deviceId || !recordingId || !s3Key || !confirmedIntent) {
        return resp(400, {
          error:
            "Missing required fields: deviceId, recordingId, s3Key, confirmedIntent",
        });
      }

      const nowIso = new Date().toISOString();
      const createdIso = createdAt ? new Date(createdAt).toISOString() : nowIso;

      const pk = `USER#${deviceId}`;
      const sk = `TS#${createdIso}#REC#${recordingId}`;

      const item = {
        pk,
        sk,
        recordingId,
        deviceId,
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

    // Unsupported method
    return resp(405, { error: `Method not allowed: ${method}` });
  } catch (err) {
    console.error("RecordingsFunction error:", err);
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
      "Access-Control-Allow-Methods": "OPTIONS,GET,POST",
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
