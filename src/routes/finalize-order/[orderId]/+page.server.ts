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

  // Check if order needs immediate payment
  const shouldShowPaymentOptions = orderDetail?.paymentOption === "pay_now" && !orderDetail?.paymentStatus;

  // Check payment status if a payment reference exists
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

        // Reload order details after payment status update
        const updatedOrder = await prisma.order.findFirst({
          where: { id: orderId },
          select: { paymentStatus: true }
        });

        if (updatedOrder) {
          orderDetail.paymentStatus = updatedOrder.paymentStatus;
        }
      }
    } catch (error) {
      console.error("Error verifying payment:", error);
    }
  }

  // Initialize payment form with user data if available
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
    pricingConfig: configData,
    shouldShowPaymentOptions,
    verifyPayment
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

// Helper function to initialize Chapa payment
async function initializeChapa(
  orderDetail: any,
  userDetails: {
    email: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
  }
) {
  const tx_ref = randomBytes(10).toString("hex");

  // Format phone number
  const regex = /(^0)|(\d+)/g;
  const validPhoneNumber = userDetails.phoneNumber.replace(
    regex,
    (match: string) => {
      if (match[0] === "0") return "";
      return "251" + match;
    }
  );

  // Prepare callback and return URLs with order ID
  const orderCallbackUrl = `${WEBAPP_URL}/order-detail/${orderDetail.id}`;

  try {
    const response = await fetch(
      "https://api.chapa.co/v1/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer CHASECK_TEST-XnClzXRLcCLdg7cpBpuVMhPPgeTd7xNo",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: orderDetail?.totalCost?.toString() || "0",
          currency: "ETB",
          email: userDetails.email,
          first_name: userDetails.firstName,
          last_name: userDetails.lastName,
          phone_number: validPhoneNumber,
          tx_ref: tx_ref,
          callback_url: orderCallbackUrl,
          return_url: orderCallbackUrl,
          "customization[title]": `Payment for Order #${orderDetail.id}`,
          "customization[description]": `Package from ${orderDetail?.Sender?.User?.userName || "Sender"} to ${orderDetail?.Receiver?.User?.userName || orderDetail?.receiverName || "Receiver"}`,
        }),
      }
    );

    const data = await response.json();

    if (data.status === "success") {
      // Update order with payment reference
      await prisma.order.update({
        where: { id: orderDetail.id },
        data: {
          paymentRef: tx_ref,
          paymentMethod: "CHAPA",
          paymentDate: new Date(),
          paymentAmount: orderDetail.totalCost || 0,
        },
      });

      return { success: true, checkoutUrl: data.data.checkout_url, tx_ref };
    } else {
      throw new Error(data.message || "Failed to initialize payment");
    }
  } catch (error) {
    console.error("Error initializing Chapa payment:", error);
    throw error;
  }
}

export let actions = {
  paymentUrl: async (event) => {
    const addPaymentForm = await superValidate(event.request, zod(addPaymentSchema));

    if (!addPaymentForm.valid) {
      return fail(400, { addPaymentForm, errorMessage: addPaymentForm.errors });
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

    if (!orderDetail) {
      return fail(404, { errorMessage: "Order not found" });
    }

    try {
      const result = await initializeChapa(orderDetail, addPaymentForm.data);
      return {
        checkoutUrl: { checkout_url: result.checkoutUrl },
        addPaymentForm
      };
    } catch (error) {
      console.error("Error creating payment URL:", error);
      return fail(500, {
        addPaymentForm,
        errorMessage: "Failed to create payment URL. Please try again."
      });
    }
  },

  // For handling immediate payment during order creation
  initiatePayment: async (event) => {
    const orderId = Number(event.params.orderId);
    const session = await event.locals.getSession() as EnhancedSessionType | null;

    if (!session) {
      return fail(401, { errorMessage: "You must be logged in to make a payment." });
    }

    const orderDetail = await prisma.order.findFirst({
      where: { id: orderId },
      include: {
        Sender: { include: { User: true } },
        Receiver: { include: { User: true } },
      },
    });

    if (!orderDetail) {
      return fail(404, { errorMessage: "Order not found" });
    }

    // Prefill form with user data
    const userDetails = {
      email: session.userData.email || "",
      phoneNumber: session.userData.phoneNumber || "",
      firstName: session.userData.userName?.split(' ')[0] || "",
      lastName: session.userData.userName?.split(' ')[1] || session.userData.userName || "",
    };

    try {
      const result = await initializeChapa(orderDetail, userDetails);

      // Redirect to the checkout URL
      throw redirect(303, result.checkoutUrl);
    } catch (error) {
      if (error instanceof Response) throw error; // For redirects

      console.error("Failed to initiate payment:", error);
      return fail(500, {
        errorMessage: "Failed to initialize payment. Please try again or select a different payment method."
      });
    }
  },

  // Bank transfer payments
  bankTransfer: async (event) => {
    const addPaymentForm = await superValidate(event.request, zod(addPaymentSchema));

    if (!addPaymentForm.valid) {
      return fail(400, { addPaymentForm, errorMessage: addPaymentForm.errors });
    }

    const formData = await event.request.formData();
    const transactionRef = formData.get("transactionRef") as string;

    if (!transactionRef?.trim()) {
      return fail(400, {
        addPaymentForm,
        errorMessage: "Transaction reference is required"
      });
    }

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
          paymentDate: new Date(),
          paymentAmount: orderDetail.totalCost || 0,
        },
      });

      // Redirect to order detail page
      throw redirect(303, `/order-detail/${orderDetail.id}`);
    } catch (error) {
      if (error instanceof Response) throw error; // For redirects

      console.error("Error processing bank transfer:", error);
      return fail(500, {
        addPaymentForm,
        errorMessage: "Failed to process bank transfer. Please try again."
      });
    }
  }
};
