import { WEBAPP_URL } from "$env/static/private";
import { prisma } from "$lib/utils/prisma.js";
import { fail, redirect } from "@sveltejs/kit";
import { randomBytes } from "crypto";
import { zod } from "sveltekit-superforms/adapters";
import { superValidate } from "sveltekit-superforms/server";
import { z } from "zod";

const addPaymentSchema = z.object({
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  phoneNumber: z
    .string()
    .regex(
      new RegExp(/(251\d{10})|(\d{10})|(\d{9})|((?<!0)\d{9})/),
      "Wrong phone Number Format"
    ),
});
// .refine(
//   (val) => /(251\d{10})|(\d{10})|(\d{9})|((?<!0)\d{9})/.test(val),
//   "Wrong Phone Number Format"
// ),
export type addPaymentType = z.infer<typeof addPaymentSchema>;

export const load = async (event) => {
  const { params, depends } = event;
  const orderId = params.orderId;

  depends(`orders:${orderId}`);

  const session =
    (await event.locals.getSession()) as EnhancedSessionType | null;
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
    },
  });
  const addPaymentForm = superValidate(
    {
      email: session?.userData.email || "",
      phoneNumber: session?.userData.phoneNumber || "",

      firstName: session?.userData.userName || "",
      lastName: session?.userData.userName || "",
    } satisfies addPaymentType,
    zod(addPaymentSchema)
  );
  console.log({ orderDetail });


  const regions = await prisma.region.findMany({
    where: { deletedAt: null },
  });
  const customer = await prisma.customer.findUnique({
    where: { id: Number(session?.customerData.id) },
    include: { User: true }
  });

  const [
    cities,
    pricingMatrix,
    packagingFees,
    customerTypeMultipliers,
    orderTypeMultipliers,
    goodsTypeMultipliers,
    inCityPricing,

    vehicleTypeMultipliers,
    additionalFees,
    subscriptionTypes,
    premiumTypeMultipliers
  ] = await Promise.all([
    prisma.pricingMatrix.findMany({
      select: { originCity: true, destinationCity: true },
      distinct: ['originCity', 'destinationCity'],
      where: { deletedAt: null }
    }),
    prisma.pricingMatrix.findMany({ where: { deletedAt: null } }),
    prisma.packagingFee.findMany({ where: { deletedAt: null } }),
    prisma.customerTypeMultiplier.findMany({ where: { deletedAt: null } }),
    prisma.orderTypeMultiplier.findMany({ where: { deletedAt: null } }),
    prisma.goodsTypeMultiplier.findMany({ where: { deletedAt: null } }),
    prisma.inCityPricing.findMany({ where: { deletedAt: null } }),
    prisma.vehicleTypeMultiplier.findMany({ where: { deletedAt: null } }),
    prisma.additionalFee.findMany({ where: { deletedAt: null } }),
    prisma.subscriptionTypeMultiplier.findMany({
      where: { deletedAt: null },
      orderBy: { type: 'asc' }
    }),
    prisma.premiumTypeMultiplier.findMany({ where: { deletedAt: null } })
  ]);

  // Get customer data




  let verifyPayment;
  const verifyPaymentResponse = await fetch(
    `https://api.chapa.co/v1/transaction/verify/${orderDetail?.paymentRef}`,
    {
      method: "GET",
      headers: {
        Authorization: "Bearer CHASECK_TEST-XnClzXRLcCLdg7cpBpuVMhPPgeTd7xNo",
        "Content-Type": "application/json",
      },
    }
  );
  await verifyPaymentResponse.json().then((res) => {
    console.log(res);
    verifyPayment = res.data;
  });

  // @ts-ignore
  if (verifyPayment && verifyPayment.status === "success") {
    console.log("Payment Verified");

    const updateOrder = await prisma.order.update({
      where: {
        id: Number(event.params.orderId),
      },
      data: {
        paymentStatus: true,
      },
    });


  } else {
  }

  return {
    orderDetail, addPaymentForm, regions, customer, pricingConfig: {
      cities: [...new Set(cities.map(c => c.originCity))],
      pricingMatrix: pricingMatrix.reduce((acc, curr) => {
        acc[curr.originCity] = acc[curr.originCity] || {};
        acc[curr.originCity][curr.destinationCity] = curr.unitRate;
        return acc;
      }, {}),
      packagingFees: packagingFees.reduce((acc, curr) => {
        acc[curr.packagingType] = curr.price;
        return acc;
      }, {}),
      multipliers: {
        customerType: customerTypeMultipliers.reduce((acc, curr) => {
          acc[curr.type] = curr.multiplier;
          return acc;
        }, {}),
        orderType: orderTypeMultipliers.reduce((acc, curr) => {
          acc[curr.type] = curr.multiplier;
          return acc;
        }, {}),
        goodsType: goodsTypeMultipliers.reduce((acc, curr) => {
          acc[curr.type] = curr.multiplier;
          return acc;
        }, {})
      },
      inCityPricing: inCityPricing.reduce((acc, curr) => {
        acc[curr.city] = {
          baseFare: curr.baseFare,
          distanceCharge: curr.distanceCharge,
          timeCharge: curr.timeCharge,
          cancellationRate: curr.cancellationRate
        };
        return acc;
      }, {}),
      vehicleTypes: vehicleTypeMultipliers.reduce((acc, curr) => {
        acc[curr.city] = acc[curr.city] || {};
        acc[curr.city][curr.vehicleType] = curr.multiplier;
        return acc;
      }, {}),
      additionalFees: additionalFees.reduce((acc, curr) => {
        acc[curr.city] = acc[curr.city] || [];
        acc[curr.city].push({
          name: curr.feeName,
          amount: curr.feeAmount,
          description: curr.description
        });

        return acc;
      }, {}),
      subscriptionTypes: subscriptionTypes.reduce((acc, curr) => {
        acc[curr.type] = curr.multiplier;
        return acc;
      }, {}),
      premiumTypes: premiumTypeMultipliers.reduce((acc, curr) => {
        acc[curr.type] = curr.multiplier;
        return acc;
      }, {})

    }
  };
};

export let actions = {
  paymentUrl: async (event) => {
    const addPaymentForm = await superValidate(event.request, addPaymentSchema);

    if (addPaymentForm.errors.phoneNumber) {
      return fail(500, { addPaymentForm, errorMessage: addPaymentForm.errors });
    }

    const regex = /(^0)|(\d+)/g;

    const validPhoneNumber = addPaymentForm.data.phoneNumber.replace(
      regex,
      (match) => {
        if (match[0] === "0") return "";
        return "251" + match;
      }
    );
    let checkoutUrl;
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
      },
    });

    try {
      const tx_ref = randomBytes(10).toString("hex");
      const checkoutUrlRequest = await fetch(
        "https://api.chapa.co/v1/transaction/initialize",
        {
          method: "POST",
          headers: {
            Authorization:
              "Bearer CHASECK_TEST-XnClzXRLcCLdg7cpBpuVMhPPgeTd7xNo",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: orderDetail?.totalCost?.toString() || "0",
            currency: "ETB",
            email: addPaymentForm.data.email,
            first_name: addPaymentForm.data.firstName,
            last_name: addPaymentForm.data.lastName,
            phone_number: validPhoneNumber,
            tx_ref: tx_ref,
            callback_url: WEBAPP_URL,
            return_url: WEBAPP_URL,
            "customization[title]":
              orderDetail?.Sender.User.userName +
              "Paying for Order: " +
              orderDetail?.id,
            "customization[description]":
              "Package sent to: " + orderDetail?.Receiver?.User.userName ||
              orderDetail?.receiverName,
          }),
        }
      );

      await checkoutUrlRequest.json().then((res) => {
        checkoutUrl = res.data;
      });

      const updateOrder = await prisma.order.update({
        where: {
          id: Number(event.params.orderId),
        },
        data: {
          paymentRef: tx_ref,
          paymentMethod: "CHAPA",
          paymentDate: new Date(),
          paymentAmount: orderDetail?.totalCost || 0,
        },
      });
    } catch (error) {
      console.log(error as Error);
    }

    return { checkoutUrl, addPaymentForm };
  },

  // New action for bank transfer payments
  bankTransfer: async (event) => {
    const addPaymentForm = await superValidate(event.request, addPaymentSchema);

    if (addPaymentForm.errors.phoneNumber) {
      return fail(500, { addPaymentForm, errorMessage: addPaymentForm.errors });
    }

    const formData = await event.request.formData();
    const transactionRef = formData.get("transactionRef") as string;

    // Get the order details
    const orderDetail = await prisma.order.findFirst({
      where: {
        id: Number(event.params.orderId),
      },
    });

    if (!orderDetail) {
      return fail(404, { errorMessage: "Order not found" });
    }

    try {
      // Update the order with bank transfer information
      await prisma.order.update({
        where: {
          id: Number(event.params.orderId),
        },
        data: {
          paymentMethod: "BANK_TRANSFER" as any, // Type cast to avoid TypeScript error
          paymentRef: transactionRef,
          // Mark as pending verification
          paymentStatus: false,
        },
      });

      // For bank transfers, add a toast message but don't set payment status to true yet
      // (would be verified manually)

      // If the payment option is "pay_now", redirect to order detail page
      if (orderDetail.paymentOption === "pay_now") {
        throw redirect(302, `/order-detail/${orderDetail.id}`);
      }

      // Return success
      return {
        success: true,
        message: "Bank transfer details submitted successfully. Your payment is pending verification.",
      };
    } catch (error) {
      console.error("Error processing bank transfer:", error);
      return fail(500, {
        addPaymentForm,
        errorMessage: "Failed to process bank transfer. Please try again."
      });
    }
  }
};
