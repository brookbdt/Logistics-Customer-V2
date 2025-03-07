import { prisma } from "$lib/utils/prisma.js";
import { fail } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms/server";
import { z } from "zod";

const addTicketCommentSchema = z.object({
  text: z.string().optional(),
  reopen: z.boolean(),
});

export const load = async (event) => {
  const ticketDetail = await prisma.ticket.findFirst({
    where: {
      id: Number(event.params.ticketId),
    },
    include: {
      AssignedTo: {
        include: {
          User: true,
        },
      },
      CreatedBy: {
        include: {
          User: true,
        },
      },
      Customer: {
        include: {
          User: true,
        },
      },
      Warehouse: true,
      Comments: {
        include: {
          User: true,
        },
      },
    },
  });

  const addTicketCommentForm = await superValidate(addTicketCommentSchema);

  return {
    ticketDetail,
    addTicketCommentForm,
  };
};

export const actions = {
  addComment: async (event) => {
    const addTicketCommentForm = await superValidate(
      event.request,
      addTicketCommentSchema
    );

    const session =
      (await event.locals.getSession()) as EnhancedSessionType | null;

    if (!session?.userData) {
      return fail(401, { errorMessage: "Unauthorized" });
    }

    console.log("here", addTicketCommentForm.data.reopen);
    if (addTicketCommentForm.data.reopen) {
      console.log("Reopen ticket");
      await prisma.ticket.update({
        where: {
          id: Number(event.params.ticketId),
        },
        data: {
          reOpened: true,
          ticketStatus: "ASSIGNED",
        },
      });
    }

    let createComment;
    if (addTicketCommentForm.data.text) {
      createComment = await prisma.comments.create({
        data: {
          text: addTicketCommentForm.data.text,
          userId: session?.userData.id,
          ticketId: Number(event.params.ticketId),
        },
      });
    }

    return {
      createComment,
      addTicketCommentForm,
    };
  },
};
