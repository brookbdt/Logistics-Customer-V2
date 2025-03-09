import { S3_BUCKET_NAME } from "$env/static/private";
import { s3, getFile } from "$lib/utils/aws-file.js";
import { prisma } from "$lib/utils/prisma.js";
import { error, fail } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms/server";
import { z } from "zod";

const customerInformationSchema = z.object({
  userName: z.string().optional(),
  email: z.string().email().optional(),
  phoneNumber: z.string().optional(),
  customerType: z.enum(["INDIVIDUAL", "BUSINESS"]).optional(),
  premium: z.boolean().optional(),
  physicalAddress: z.string().optional(),
  mapAddress: z.string().optional(),
  companyName: z.string().optional(),
  tin: z.string().optional(),
});

export type customerInformationType = z.infer<typeof customerInformationSchema>;

export const load = async (event) => {
  const session =
    (await event.locals.getSession()) as EnhancedSessionType | null;
  if (!session) {
    throw error(401, "Unauthorized");
  }

  // console.log("session", session);
  const data = await prisma.user.findFirst({
    where: {
      id: session?.userData.id,
    },
    include: {
      Customer: true,
    },
  });
  if (!data) {
    throw error(500, "user not found");
  }

  const customerInformationForm = await superValidate(
    {
      userName: data.userName ?? undefined,
      email: data.email,
      phoneNumber: data.phoneNumber ?? undefined,
      customerType: data.Customer?.customerType ?? undefined,
      premium: data.Customer?.premium ?? undefined,
      mapAddress: data.Customer?.mapAddress ?? undefined,
      physicalAddress: data.Customer?.physicalAddress ?? undefined,
      companyName: data.Customer?.companyName ?? undefined,
      tin: data.Customer?.tinNumber ?? undefined,
    } satisfies customerInformationType,
    customerInformationSchema
  );

  // Check if the image exists in S3/R2
  // let imgUrl = "";
  const imgUrl = await getFile(
    `customerProfilePicture/${session?.customerData.id}`
  );

  // Also create a proxy URL that avoids CORS issues
  const proxyImgUrl = `/api/images/${encodeURIComponent(`customerProfilePicture/${session?.customerData.id}`)}`;

  const profileKeyPrefix = `customerProfilePicture/${session?.userData.id}`;

  // try {
  //   console.log('hey')

  //   // List objects with the prefix to find the image
  //   const listResult = await s3.listObjectsV2({
  //     Bucket: S3_BUCKET_NAME,
  //     Prefix: profileKeyPrefix
  //   }).promise();

  //   console.log('listResult')
  //   console.log('listResult', listResult)

  //   // Find the most recent image with this prefix
  //   if (listResult.Contents && listResult.Contents.length > 0) {
  //     // Sort by last modified date (most recent first)
  //     const sortedFiles = listResult.Contents.sort((a, b) => {
  //       return (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0);
  //     });

  //     // Use the most recent file
  //     const latestFile = sortedFiles[0];

  //     console.log('latestFile', latestFile)

  //     if (latestFile.Key) {
  //       // Get the file details
  //       const headResult = await s3.headObject({
  //         Bucket: S3_BUCKET_NAME,
  //         Key: latestFile.Key
  //       }).promise();

  //       // Create the URL with the exact key
  //       const encodedKey = encodeURIComponent(latestFile.Key);

  //       // Add a timestamp to prevent caching
  //       imgUrl = `/api/images/${encodedKey}?t=${Date.now()}`;

  //       console.log("Found profile image:", {
  //         key: latestFile.Key,
  //         contentType: headResult.ContentType,
  //         size: headResult.ContentLength,
  //         url: imgUrl
  //       });
  //     }
  //   } else {
  //     console.log("No profile images found with prefix:", profileKeyPrefix);
  //   }
  // } catch (err) {
  //   // Error finding image, leave imgUrl empty
  //   console.error("Error finding profile image:", err);
  // }

  return {
    imgUrl,
    proxyImgUrl,
    customerInformationForm,
  };
};

// Add type definition for the response
type UploadResponse = {
  success: boolean;
  data: {
    imgUrl: string;
    contentType?: string;
  };
};

export let actions = {
  updateCustomer: async (event) => {
    const session =
      (await event.locals.getSession()) as EnhancedSessionType | null;
    const customerInformationForm = await superValidate(
      event.request.clone(),
      customerInformationSchema
    );
    const data = await event.request.clone().formData();
    const mapAddress = data.get("mapAddress");

    if (!customerInformationForm.valid) {
      return fail(500, {
        customerInformationForm,
        errorMessage: "Issue with the form.",
      });
    }
    if (typeof mapAddress !== "string") {
      return fail(500, {
        customerInformationForm,
        errorMessage: "Issue with the form.",
      });
    }
    const updatedCustomer = await prisma.user.update({
      where: { id: session?.userData.id },
      data: {
        userName: customerInformationForm.data.userName,
        phoneNumber: customerInformationForm.data.phoneNumber,
        Customer: {
          update: {
            customerType: customerInformationForm.data.customerType,
            premium: customerInformationForm.data.premium,
            mapAddress: mapAddress,
            physicalAddress: customerInformationForm.data.physicalAddress,
            companyName: customerInformationForm.data.companyName,
            tinNumber: customerInformationForm.data.tin,
          },
        },
      },
    });

    return { customerInformationForm, updatedCustomer };
  },

  uploadProfilePicture: async (event) => {
    const data = await event.request.formData();
    const file = data.get("profilePicture");
    const key = data.get("profileKey");

    if (!(file instanceof File)) {
      console.error("File upload failed: Not a valid file object");
      return fail(500, { errorMessage: "Issue with the file uploaded." });
    }
    if (typeof key !== "string") {
      console.error("File upload failed: Invalid key", key);
      return fail(500, { errorMessage: "Issue with the key attached." });
    }

    console.log('Uploading file with key:', key);
    console.log('File details:', {
      name: file.name,
      type: file.type,
      size: file.size
    });

    const buffer = await file.arrayBuffer();
    const send = Buffer.from(buffer);

    try {
      // First check if an image already exists with this key
      try {
        const headResult = await s3.headObject({
          Bucket: S3_BUCKET_NAME,
          Key: key
        }).promise();

        console.log('Existing image found, will be replaced:', {
          key,
          contentType: headResult.ContentType,
          size: headResult.ContentLength
        });
      } catch (err) {
        // No existing image found, which is fine
        console.log('No existing image found with this key, creating new one');
      }

      // IMPORTANT: If images aren't displaying due to CORS errors, you need to configure CORS on your R2 bucket.
      // In the Cloudflare dashboard:
      // 1. Go to R2 > Buckets > [your-bucket-name] > Settings > CORS
      // 2. Add a new CORS rule with:
      //    - Origin: http://localhost:5173 (for development) and your production domain
      //    - Allowed methods: GET, HEAD
      //    - Allowed headers: *
      //    - Max age: 86400 (or your preferred value)
      // 3. Save the configuration

      // IMPORTANT: For 403 Forbidden errors, check these settings:
      // 1. Make sure your R2 bucket has public access enabled for read operations
      // 2. Verify that your API keys have the correct permissions
      // 3. Check that the object ACL allows public read access

      const contentType = file.type || 'image/jpeg';
      console.log('Using content type:', contentType);

      const uploadResult = await s3
        .putObject({
          Bucket: S3_BUCKET_NAME,
          Key: key,
          Body: send,
          ContentType: contentType,
          ACL: 'public-read', // Try setting public-read ACL if your bucket supports it
        })
        .promise();

      console.log('File uploaded successfully:', uploadResult);

      // Generate a signed URL for the uploaded file
      const imgUrl = await getFile(key);
      console.log('Generated URL for uploaded file:', imgUrl);

      // Also create a proxy URL that avoids CORS and permission issues
      const proxyImgUrl = `/api/images/${encodeURIComponent(key)}`;
      console.log('Generated proxy URL:', proxyImgUrl);

      return {
        success: true,
        data: {
          imgUrl,
          proxyImgUrl
        }
      };
    } catch (error) {
      console.error("Error uploading file", error);
      return fail(500, {
        errorMessage: "Failed to upload file to storage",
        details: (error as Error).message
      });
    }
  },

  deleteProfilePicture: async (event) => {
    const data = await event.request.formData();
    const key = data.get("profileKey");

    if (typeof key !== "string") {
      console.error("Delete failed: Invalid key", key);
      return fail(500, { errorMessage: "Issue with the key attached." });
    }

    console.log('Attempting to delete profile picture with key:', key);

    try {
      // Check if the file exists first
      try {
        await s3.headObject({
          Bucket: S3_BUCKET_NAME,
          Key: key,
        }).promise();
      } catch (err) {
        console.error("File not found for deletion:", key);
        return fail(404, { errorMessage: "Profile picture not found." });
      }

      // Delete the file
      await s3.deleteObject({
        Bucket: S3_BUCKET_NAME,
        Key: key,
      }).promise();

      console.log('Profile picture deleted successfully:', key);

      return {
        success: true,
        message: "Profile picture removed successfully"
      };
    } catch (error) {
      console.error("Error deleting profile picture:", error);
      return fail(500, {
        errorMessage: "Failed to delete profile picture",
        details: (error as Error).message
      });
    }
  },

};
