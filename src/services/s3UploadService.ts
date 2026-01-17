import * as FileSystem from "expo-file-system/legacy";

export async function uploadToPresignedUrl(uploadUrl: string, fileUri: string) {
  const res = await FileSystem.uploadAsync(uploadUrl, fileUri, {
    httpMethod: "PUT",
    headers: {
      "Content-Type": "audio/m4a",
    },
  });

  if (res.status !== 200) {
    throw new Error(
      `S3 upload failed with status ${res.status}: ${res.body ?? ""}`,
    );
  }
}