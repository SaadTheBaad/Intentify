const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const crypto = require("crypto");

const s3 = new S3Client({});

function getUserSub(event) {
  // REST API + Cognito authorizer often injects claims here:
  const claims = event?.requestContext?.authorizer?.claims;
  const sub = claims?.sub;
  return sub || null;
}

exports.handler = async (event) => {
  try {
    const bucket = process.env.BUCKET_NAME;
    if (!bucket) throw new Error("Missing BUCKET_NAME env var");

    const userSub = getUserSub(event);
    if (!userSub) {
      return {
        statusCode: 401,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "Unauthorized (missing user identity)" }),
      };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const contentType = body.contentType || "audio/m4a";

    const id = crypto.randomUUID();
    const key = `users/${userSub}/recordings/${Date.now()}-${id}.m4a`;

    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 120 });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ uploadUrl, key, bucket }),
    };
  } catch (err) {
    console.error("PresignFunction error:", err);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: err.message || "presign failed" }),
    };
  }
};
