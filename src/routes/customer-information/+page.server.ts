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

  console.log("session", session);
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

  const imgUrl = await getFile(
    `customerProfilePicture/${session?.userData.id}`
  );

  return {
    imgUrl,
    customerInformationForm,
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

    if (typeof mapAddress !== "string") {
      return fail(500, { errorMessage: "Issue with the map address." });
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
      return fail(500, { errorMessage: "Issue with the file uploaded." });
    }
    if (typeof key !== "string") {
      return fail(500, { errorMessage: "Issue with the key attached." });
    }

    const buffer = await file.arrayBuffer();

    const send = Buffer.from(buffer);

    try {
      await s3
        .putObject({
          Bucket: S3_BUCKET_NAME,
          Key: key,
          Body: send,
        })
        .promise();
    } catch (error) {
      console.log(error as Error);
    }

    return;
  },
};
