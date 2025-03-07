import { prisma } from "$lib/utils/prisma.js";
import { redirect } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms/server";
import { z } from "zod";

const addOrderRatingSchema = z.object({
  comment: z.string(),
  rating: z.number(),
  customerId: z.number(),
});

const addDriverRatingSchema = z.object({
  comment: z.string(),
  rating: z.number(),
  driverUserId: z.number(),
  customerId: z.number(),
});

export const load = async (event) => {
  if (!event.params.orderId) {
    throw new Error("Order Id not found!");
  }

  const orderDetail = await prisma.order.findFirst({
    where: {
      id: Number(event.params.orderId),
    },
    include: {
      Sender: {
        include: {
          User: true,
        },
      },
      Receiver: {
        include: {
          User: true,
        },
      },
      OrderRating: {
        include: {
          Customer: {
            include: {
              User: true,
            },
          },
        },
      },
      DriverRating: {
        include: {
          Customer: {
            include: {
              User: true,
            },
          },
        },
      },
      orderMilestone: true,
      Tracker: true,
      Dispatch: {
        where: {
          OrderDispatches: {
            every: {
              dispatchStatus: "INPROGRESS",
            },
          },
        },
        include: {
          AssignedVendorDriver: {
            include: {
              User: true,
            },
          },
          AssignedEmployee: {
            include: {
              User: true,
            },
          },
        },
      },
      OrderDispatch: {
        include: {
          Dispatch: {
            include: {
              AssignedVendorDriver: {
                include: {
                  User: true,
                },
              },
              AssignedEmployee: {
                include: {
                  User: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (orderDetail?.orderStatus === "UNCLAIMED" || !orderDetail?.paymentStatus) {
    throw redirect(302, `/finalize-order/${orderDetail?.id}`);
  }

  const addOrderRatingForm = await superValidate(addOrderRatingSchema);

  const addDriverRatingForm = await superValidate(addDriverRatingSchema);
  return { orderDetail, addOrderRatingForm, addDriverRatingForm };
};

export const actions = {
  addOrderRating: async (event) => {
    const addOrderRatingForm = await superValidate(
      event.request,
      addOrderRatingSchema
    );

    const createOrderRating = await prisma.orderRating.create({
      data: {
        comment: addOrderRatingForm.data.comment,
        rating: addOrderRatingForm.data.rating,
        orderId: Number(event.params.orderId),
        customerId: addOrderRatingForm.data.customerId,
      },
    });

    return { addOrderRatingForm, createOrderRating };
  },
  addDriverRating: async (event) => {
    const addDriverRatingForm = await superValidate(
      event.request,
      addDriverRatingSchema
    );

    const createDriverRating = await prisma.driverRating.create({
      data: {
        userId: addDriverRatingForm.data.driverUserId,
        comment: addDriverRatingForm.data.comment,
        rating: addDriverRatingForm.data.rating,
        customerId: addDriverRatingForm.data.customerId,
        orderId: Number(event.params.orderId),
      },
    });

    return { addDriverRatingForm, createDriverRating };
  },
};
