import { prisma } from "$lib/utils/prisma.js";
import { redirect } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms/server";
import { z } from 'zod';

const pricingCalculationSchema = z.object({
  // Location
  originCity: z.string().min(1, "Origin city is required"),
  destinationCity: z.string().min(1, "Destination city is required"),
  isInCity: z.boolean().default(false),

  // Package Details
  actualWeight: z.number().min(0.1, "Weight must be at least 0.1 kg"),
  length: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),

  // Service Options
  orderType: z.enum(['STANDARD', 'EXPRESS', 'SAME_DAY']),
  goodsType: z.enum(['NORMAL', 'SPECIAL_CARE']),
  packagingType: z.enum(['STANDARD_BOX', 'PREMIUM_BOX', 'SPECIALTY_PACKAGING', 'CUSTOM_PACKAGING']),

  // For in-city only
  distance: z.number().optional(),
  estimatedTime: z.number().optional(),
  vehicleType: z.enum(['BIKE', 'CAR', 'TRUCK']).optional(),
});

export type PricingCalculation = z.infer<typeof pricingCalculationSchema>;

export const load = async (event) => {
  const search = event.url.searchParams.get("searchOrder");

  const session =
    (await event.locals.getSession()) as EnhancedSessionType | null;
  console.log({ session });

  if (!session?.customerData.customerType) {
    throw redirect(302, "/customer-information");
  }


  const myOrders = await prisma.order.findMany({
    where: {
      OR: [
        {
          senderCustomerId: session.customerData.id,
        },
        {
          receiverCustomerId: session.customerData.id,
        },
      ],
      ...(search ? { id: Number(search) } : {}),
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
    orderBy: {
      createdAt: "desc",
    },
  });


  // Get customer data
  const customer = await prisma.customer.findUnique({
    where: { userId: session.customerData.id },
    include: { User: true }
  });

  // Get pricing configuration
  const [
    cities,
    pricingMatrix,
    packagingFees,
    customerTypeMultipliers,
    orderTypeMultipliers,
    goodsTypeMultipliers,
    inCityPricing,

    vehicleTypeMultipliers,
    additionalFees
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
    prisma.additionalFee.findMany({ where: { deletedAt: null } })
  ]);

  // Create form with default values
  const form = await superValidate(pricingCalculationSchema);


  return {
    myOrders,
    form,
    customer,

    pricingConfig: {
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
      }, {})
    }

  };
};

export let actions = {
  searchOrder: async (event) => {
    const data = await event.request.formData();
    const query = data.get("orderId");

    const orderFound = await prisma.order.findFirst({
      where: { id: Number(query), deletedAt: null },
      include: {
        Receiver: {
          include: { User: true },
        },
        Sender: {
          include: { User: true },
        },
      },
    });

    return { orderFound };
  },
};
