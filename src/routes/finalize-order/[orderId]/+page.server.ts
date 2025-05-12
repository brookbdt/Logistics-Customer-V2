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
  const orderId = Number(params.orderId);

  depends(`orders:${orderId}`);

  const session =
    (await event.locals.getSession()) as EnhancedSessionType | null;
  if (!orderId) {
    throw new Error("Order Id not found!");
  }

  // Fetch order details and related data in a single query
  const orderDetail = await prisma.order.findFirst({
    where: {
      id: orderId,
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
      orderMilestone: {
        orderBy: {
          createdAt: 'desc'
        },
      },
      Dispatch: {
        include: {
          AssignedEmployee: {
            include: {
              User: true
            }
          },
          AssignedVendorDriver: {
            include: {
              User: true
            }
          }
        }
      },
      OrderDispatch: {
        include: {
          Dispatch: {
            include: {
              AssignedEmployee: {
                include: {
                  User: true
                }
              },
              AssignedVendorDriver: {
                include: {
                  User: true
                }
              }
            }
          }
        }
      }
    },
  });

  // Check payment status
  let verifyPayment;
  if (orderDetail?.paymentRef) {
    try {
      const verifyPaymentResponse = await fetch(
        `https://api.chapa.co/v1/transaction/verify/${orderDetail.paymentRef}`,
        {
          method: "GET",
          headers: {
            Authorization: "Bearer CHASECK_TEST-XnClzXRLcCLdg7cpBpuVMhPPgeTd7xNo",
            "Content-Type": "application/json",
          },
        }
      );

      const paymentData = await verifyPaymentResponse.json();
      console.log("Payment verification response:", paymentData);
      verifyPayment = paymentData.data;

      // Update payment status if successful
      if (verifyPayment && verifyPayment.status === "success" && !orderDetail.paymentStatus) {
        console.log("Payment Verified - updating order payment status");
        await prisma.order.update({
          where: { id: orderId },
          data: { paymentStatus: true }
        });
      }
    } catch (error) {
      console.error("Error verifying payment:", error);
    }
  }

  // Initialize payment form
  const addPaymentForm = await superValidate(
    {
      email: session?.userData.email || "",
      phoneNumber: session?.userData.phoneNumber || "",
      firstName: session?.userData.userName?.split(' ')[0] || "",
      lastName: session?.userData.userName?.split(' ')[1] || session?.userData.userName || "",
    } satisfies addPaymentType,
    zod(addPaymentSchema)
  );

  // Load configuration data in parallel
  const [
    regions,
    customer,
    configData
  ] = await Promise.all([
    prisma.region.findMany({
      where: { deletedAt: null },
    }),
    session?.customerData.id
      ? prisma.customer.findUnique({
        where: { id: Number(session.customerData.id) },
        include: { User: true }
      })
      : null,
    loadPricingConfig()
  ]);

  return {
    orderDetail,
    addPaymentForm,
    regions,
    customer,
    pricingConfig: configData
  };
};

// Helper function to load pricing configuration data
async function loadPricingConfig() {
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

  // Create typed record objects
  const pricingMatrixRecord: Record<string, Record<string, number>> = {};
  pricingMatrix.forEach(curr => {
    pricingMatrixRecord[curr.originCity] = pricingMatrixRecord[curr.originCity] || {};
    pricingMatrixRecord[curr.originCity][curr.destinationCity] = curr.unitRate;
  });

  const packagingFeesRecord: Record<string, number> = {};
  packagingFees.forEach(curr => {
    packagingFeesRecord[curr.packagingType] = curr.price;
  });

  const customerTypeRecord: Record<string, number> = {};
  customerTypeMultipliers.forEach(curr => {
    customerTypeRecord[curr.type] = curr.multiplier;
  });

  const orderTypeRecord: Record<string, number> = {};
  orderTypeMultipliers.forEach(curr => {
    orderTypeRecord[curr.type] = curr.multiplier;
  });

  const goodsTypeRecord: Record<string, number> = {};
  goodsTypeMultipliers.forEach(curr => {
    goodsTypeRecord[curr.type] = curr.multiplier;
  });

  const inCityPricingRecord: Record<string, {
    baseFare: number;
    distanceCharge: number;
    timeCharge: number;
    cancellationRate: number;
  }> = {};
  inCityPricing.forEach(curr => {
    inCityPricingRecord[curr.city] = {
      baseFare: curr.baseFare,
      distanceCharge: curr.distanceCharge,
      timeCharge: curr.timeCharge,
      cancellationRate: curr.cancellationRate
    };
  });

  const vehicleTypesRecord: Record<string, Record<string, number>> = {};
  vehicleTypeMultipliers.forEach(curr => {
    vehicleTypesRecord[curr.city] = vehicleTypesRecord[curr.city] || {};
    vehicleTypesRecord[curr.city][curr.vehicleType] = curr.multiplier;
  });

  const additionalFeesRecord: Record<string, Array<{
    name: string;
    amount: number;
    description: string | null;
  }>> = {};
  additionalFees.forEach(curr => {
    additionalFeesRecord[curr.city] = additionalFeesRecord[curr.city] || [];
    additionalFeesRecord[curr.city].push({
      name: curr.feeName,
      amount: curr.feeAmount,
      description: curr.description
    });
  });

  const subscriptionTypesRecord: Record<string, number> = {};
  subscriptionTypes.forEach(curr => {
    subscriptionTypesRecord[curr.type] = curr.multiplier;
  });

  const premiumTypesRecord: Record<string, number> = {};
  premiumTypeMultipliers.forEach(curr => {
    premiumTypesRecord[curr.type] = curr.multiplier;
  });

  return {
    cities: [...new Set(cities.map(c => c.originCity))],
    pricingMatrix: pricingMatrixRecord,
    packagingFees: packagingFeesRecord,
    multipliers: {
      customerType: customerTypeRecord,
      orderType: orderTypeRecord,
      goodsType: goodsTypeRecord
    },
    inCityPricing: inCityPricingRecord,
    vehicleTypes: vehicleTypesRecord,
    additionalFees: additionalFeesRecord,
    subscriptionTypes: subscriptionTypesRecord,
    premiumTypes: premiumTypesRecord
  };
}

export let actions = {
  paymentUrl: async (event) => {
    const addPaymentForm = await superValidate(event.request, zod(addPaymentSchema));

    if (addPaymentForm.errors.phoneNumber) {
      return fail(500, { addPaymentForm, errorMessage: addPaymentForm.errors });
    }

    const regex = /(^0)|(\d+)/g;

    const validPhoneNumber = (addPaymentForm.data.phoneNumber as string).replace(
      regex,
      (match: string) => {
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
    const addPaymentForm = await superValidate(event.request, zod(addPaymentSchema));

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
