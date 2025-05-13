import { z } from 'zod';

export const priceBreakdownSchema = z.object({
    baseShippingCost: z.number(),
    effectiveWeight: z.number(),
    customerTypeMultiplier: z.number(),
    subscriptionTypeMultiplier: z.number(),
    orderTypeMultiplier: z.number(),
    vehicleTypeMultiplier: z.number(),
    goodsTypeMultiplier: z.number(),
    premiumTypeMultiplier: z.number(),
    multipliedShippingCost: z.number(),
    packagingCost: z.number(),
    additionalFees: z.array(z.object({
        name: z.string(),
        amount: z.number(),
    })),
    totalAdditionalFees: z.number(),
    totalCost: z.number(),
});

export const createOrderSchema = z.object({
    // Sender Information
    userName: z.string().min(1, "Sender name is required"),
    phoneNumber: z.string().min(1, "Sender phone number is required"),
    pickUpTime: z.date().nullish(),
    pickUpLocation: z.string().min(1, "Pickup location is required"),
    mapAddress: z.string().min(1, "Pickup map location is required"),

    // Receiver Information
    receiverUsername: z.string().min(1, "Receiver name is required"),
    receiverPhoneNumber: z.string().min(1, "Receiver phone number is required"),
    receiverEmail: z.string().email("Valid email is required").nullable().optional(),
    inCity: z.string(),
    dropOffLocation: z.string().min(1, "Dropoff location is required"),
    dropOffMapAddress: z.string().min(1, "Dropoff map location is required"),
    receiverId: z.string().optional(),
    dropOffTime: z.date().nullish(),

    // Package and Order Options
    packageType: z.string(),
    orderType: z.string(),
    goodsType: z.string(),
    packagingType: z.string(),
    vehicleType: z.string().optional(),

    // Payment Option
    paymentOption: z.enum(['pay_on_pickup', 'pay_on_delivery', 'pay_now']).default('pay_on_pickup'),

    // Weight and Dimensions
    actualWeight: z.coerce.number().min(0.1, "Weight must be at least 0.1kg").default(0.5),
    length: z.coerce.number().optional(),
    width: z.coerce.number().optional(),
    height: z.coerce.number().optional(),

    // Cities
    originCity: z.string().default("Addis Ababa"),
    deliveryCity: z.string().default("Addis Ababa"),
    destinationCity: z.string().default("Addis Ababa"),
    priceBreakdown: priceBreakdownSchema,
    totalCost: z.number(),
    // Distance and Time (for in-city deliveries)
    distanceInKm: z.coerce.number().optional(),
    estimatedTimeInMinutes: z.coerce.number().optional(),
});

export type CreateOrderSchema = typeof createOrderSchema;
export type CreateOrderFormInput = z.infer<typeof createOrderSchema>;


