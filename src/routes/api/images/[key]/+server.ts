import { S3_BUCKET_NAME } from "$env/static/private";
import { s3 } from "$lib/utils/aws-file.js";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, url }) => {
    if (!params.key) {
        throw error(400, "Missing image key");
    }

    // Decode the key parameter (it will be URL encoded)
    const decodedKey = decodeURIComponent(params.key);

    console.log(`Attempting to fetch image with key: ${decodedKey}`);

    try {
        // Check if the object exists first
        try {
            const headResult = await s3
                .headObject({
                    Bucket: S3_BUCKET_NAME,
                    Key: decodedKey,
                })
                .promise();

            if (!headResult) {
                console.log(`Image not found (head check): ${decodedKey}`);
                throw error(404, "Image not found");
            }

            console.log(`Image exists with content type: ${headResult.ContentType}, size: ${headResult.ContentLength} bytes`);
        } catch (headErr) {
            console.error(`Head check failed for image: ${decodedKey}`, headErr);
            throw error(404, "Image not found");
        }

        // Get the object directly from S3/R2
        const result = await s3
            .getObject({
                Bucket: S3_BUCKET_NAME,
                Key: decodedKey,
            })
            .promise();

        if (!result.Body) {
            console.error(`No body found for image: ${decodedKey}`);
            throw error(404, "Image data not found");
        }

        // Get the binary data
        const buffer = result.Body instanceof Buffer ? result.Body : Buffer.from(result.Body as Uint8Array);

        console.log(`Successfully retrieved image: ${decodedKey}, size: ${buffer.length} bytes, type: ${result.ContentType || 'unknown'}`);

        // Determine content type from the actual file or default to jpeg
        const contentType = result.ContentType || 'image/jpeg';

        // Return the image data with proper headers
        return new Response(buffer, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Length': buffer.length.toString(),
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Allow-Headers': 'Content-Type',
                'X-Content-Type-Options': 'nosniff'
            }
        });
    } catch (err: unknown) {
        // Properly type the error for TypeScript
        const awsError = err as { code?: string; message?: string; status?: number };
        console.error("Error fetching image:", decodedKey, awsError);

        // If it's a 404 error we already threw, just pass it through
        if (awsError.status === 404) {
            throw err;
        }

        // Check if it's an AWS error with a specific code
        if (awsError.code === 'NoSuchKey' || awsError.code === 'NotFound') {
            throw error(404, "Image not found");
        }

        throw error(500, `Error fetching image: ${awsError.message || 'Unknown error'}`);
    }
}; 