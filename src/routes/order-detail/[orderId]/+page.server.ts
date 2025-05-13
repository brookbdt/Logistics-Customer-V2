import { prisma } from "$lib/utils/prisma.js";
import { redirect } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms/server";
import { z } from "zod";
import type { Order_orderStatus } from "@prisma/client";
import { zod } from "sveltekit-superforms/adapters";

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

// Type-safe order status constants
const ORDER_STATUS = {
  BEING_REVIEWED: "BEING_REVIEWED" as Order_orderStatus,
  WAITING: "WAITING" as Order_orderStatus,
  ACCEPTED: "ACCEPTED" as Order_orderStatus,
  CANCELLED: "CANCELLED" as Order_orderStatus,
  PENDING_PAYMENT: "PENDING_PAYMENT" as Order_orderStatus
};

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

  if (orderDetail?.orderStatus === ORDER_STATUS.BEING_REVIEWED || !orderDetail?.paymentStatus) {
    if (orderDetail?.paymentOption === "pay_now" && orderDetail?.paymentStatus) {
      // Allow viewing - don't redirect
    } else if (orderDetail?.paymentOption === "pay_on_pickup") {
      // Allow viewing - don't redirect
    } else {
      throw redirect(302, `/finalize-order/${orderDetail?.id}`);
    }
  }

  const addOrderRatingForm = await superValidate(zod(addOrderRatingSchema));

  const addDriverRatingForm = await superValidate(zod(addDriverRatingSchema));
  return { orderDetail, addOrderRatingForm, addDriverRatingForm };
};

export const actions = {
  addOrderRating: async (event) => {
    const addOrderRatingForm = await superValidate(
      event.request,
      zod(addOrderRatingSchema)
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
      zod(addDriverRatingSchema)
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
  cancelOrder: async (event) => {
    const formData = await event.request.formData();
    const reason = formData.get('cancellationReason') as string;
    const orderId = Number(event.params.orderId);

    if (!reason) {
      return { success: false, error: "Cancellation reason is required" };
    }

    // Fetch the order to check its status
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { orderStatus: true }
    });

    // Allow cancellation for these statuses: BEING_REVIEWED, PENDING_PAYMENT, ACCEPTED
    const cancellableStatuses = [
      ORDER_STATUS.BEING_REVIEWED,
      ORDER_STATUS.PENDING_PAYMENT,
      ORDER_STATUS.ACCEPTED
    ];

    if (!order || !cancellableStatuses.includes(order.orderStatus)) {
      return {
        success: false,
        error: "This order cannot be cancelled as it is already in progress"
      };
    }

    // Update the order status to CANCELLED
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        orderStatus: ORDER_STATUS.CANCELLED,
        updateAt: new Date() // Update the timestamp
      }
    });

    return {
      success: true,
      cancelledOrder: updatedOrder
    };
  }
};
