import {
  S3_ACCESS_KEY,
  S3_BUCKET_NAME,
  S3_ENDPOINT,
  S3_SECRETE_KEY,
} from "$env/static/private";
import AWS from "aws-sdk";

export const s3 = new AWS.S3({
  endpoint: S3_ENDPOINT,
  accessKeyId: S3_ACCESS_KEY,
  secretAccessKey: S3_SECRETE_KEY,
  signatureVersion: "v4",
  s3ForcePathStyle: true,
});

export async function uploadFile(key: string) {
  const url = await new Promise((resolve, reject) => {
    s3.getSignedUrl(
      "putObject",
      {
        Bucket: S3_BUCKET_NAME,
        Key: key,
        Expires: 3600,
      },
      (err, res) => {
        if (err) {
          reject(err);
          // console.log({ FileUploadErr: err });
        } else {
          resolve(res);
          // console.log({ FileUploadSuc: res });
        }
      }
    );
  });

  return url;
}

export async function getFile(key: string): Promise<string> {
  try {
    // Strip any query parameters for S3 operations
    const cleanKey = key.split('?')[0];
    console.log("Getting file with key:", cleanKey);

    // First check if the object exists
    try {
      const headResult = await s3.headObject({
        Bucket: S3_BUCKET_NAME,
        Key: cleanKey
      }).promise();

      console.log("File exists, metadata:", headResult);
    } catch (err) {
      console.warn("File might not exist:", err);
      // If the file doesn't exist, return empty string early
      if ((err as any).code === 'NotFound' || (err as any).statusCode === 404) {
        console.error("File definitely does not exist in bucket. Key:", cleanKey);
        return "";
      }
    }

    // Add a timestamp parameter to prevent caching
    const timestamp = Date.now();

    // Generate signed URL
    const url = await new Promise<string>((resolve, reject) => {
      s3.getSignedUrl(
        "getObject",
        {
          Bucket: S3_BUCKET_NAME,
          Key: cleanKey,
          Expires: 3600,
          ResponseCacheControl: 'no-cache'
        },
        (err, res) => {
          if (err) {
            console.error("Error getting file URL:", err);
            reject(err);
          } else {
            console.log("Generated signed URL:", res);
            // Add cache-busting
            const urlWithCache = res.includes('?')
              ? `${res}&_t=${timestamp}`
              : `${res}?_t=${timestamp}`;
            console.log("Returning URL with cache busting:", urlWithCache);
            resolve(urlWithCache);
          }
        }
      );
    });

    return url;
  } catch (error) {
    console.error("Error in getFile:", error);
    return "";
  }
}

export async function deleteFile(key: string) {
  try {
    await s3
      .headObject({
        Bucket: S3_BUCKET_NAME,
        Key: key,
      })
      .promise();

    try {
      const url = await new Promise((resolve, reject) => {
        s3.deleteObject(
          {
            Bucket: S3_BUCKET_NAME,
            Key: key,
          },
          (err, res) => {
            if (err) {
              reject(err);
              // console.log({ FileDelErr: err });
            } else {
              resolve(res);
              // console.log({ FileDelSuc: res });
            }
          }
        );
      });
      return url;
    } catch (err) {
      console.log(`Deleting S3 subject failed with error: ${err}`);
    }
  } catch (err) {
    console.log(`S3 subject not found with error: ${err}`);
  }
}
