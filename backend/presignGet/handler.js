const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const s3 = new S3Client({});

exports.handler = async (event) => {
  try {
    const bucket = process.env.BUCKET_NAME;
    if (!bucket) return resp(500, { error: "Missing BUCKET_NAME" });

    const qs = event.queryStringParameters || {};
    const key = qs.key;
    if (!key) return resp(400, { error: "Missing key query param" });

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    // Short-lived URL
    const downloadUrl = await getSignedUrl(s3, command, { expiresIn: 60 });

    return resp(200, { ok: true, downloadUrl });
  } catch (err) {
    console.error("PresignGetFunction error:", err);
    return resp(500, { error: "Server error" });
  }
};

function resp(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "OPTIONS,GET,POST",
    },
    body: JSON.stringify(body),
  };
}

