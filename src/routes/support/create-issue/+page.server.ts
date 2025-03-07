import { S3_BUCKET_NAME } from "$env/static/private";
import { s3 } from "$lib/utils/aws-file.js";
import { prisma } from "$lib/utils/prisma.js";
import { fail } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms/server";
import { z } from "zod";

const addTicketSchema = z.object({
  title: z.string(),
  description: z.string(),
});

export const load = async (event) => {
  const addTicketForm = await superValidate(addTicketSchema);

  return { addTicketForm };
};

export const actions = {
  createTicket: async (event) => {
    const session =
      (await event.locals.getSession()) as EnhancedSessionType | null;

    const addTicketForm = await superValidate(
      event.request.clone(),
      addTicketSchema
    );

    console.log("createTicket");

    const data = await event.request.clone().formData();
    const file = data.getAll("ticketFiles");

    console.log({ file });
    file.map(async (file) => {
      if (!(file instanceof File)) {
        return fail(500, { errorMessage: "Issue with the file uploaded." });
      }
    });

    if (!addTicketForm) {
      return fail(400, { addTicketForm });
    }

    try {
      const addedTicket = await prisma.ticket.create({
        data: {
          title: addTicketForm.data.title,
          description: addTicketForm.data.description,
          ticketStatus: "UNASSIGNED",
          customerId: Number(session?.customerData.id),
        },
      });
      console.log({ addedTicket });
      if (!addedTicket) {
        return fail(500, { addTicketForm, errorMessage: "Ticket not created" });
      }
      file.map(async (file) => {
        if (!(file instanceof File)) {
          return fail(500, { errorMessage: "Issue with the file uploaded." });
        }
        const buffer = await file.arrayBuffer();
        const send = Buffer.from(buffer);
        try {
          await s3
            .putObject({
              Bucket: S3_BUCKET_NAME,
              Key: `ticketFile/${addedTicket.id}/${file.name}`,
              Body: send,
            })
            .promise();

          await prisma.file.create({
            data: {
              key: `ticketFile/${addedTicket.id}/${file.name}`,
              fileName: file.name,
              TicketFile: {
                create: {
                  ticketId: addedTicket.id,
                },
              },
            },
          });
        } catch (error) {
          console.log(error as Error);
        }
      });
      return { addTicketForm, addedTicket };
    } catch (error) {
      console.log(error as Error);
      return fail(500, { errorMessage: "Could not create a Ticket." });
    }
  },
};
