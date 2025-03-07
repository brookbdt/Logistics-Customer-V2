
import { prisma } from "$lib/utils/prisma";
import { sendMail } from "$lib/utils/send-email.server";
import type { GoodsType, Order_orderStatus, OrderType, PackageType, PackagingType, Vehicles_vehicleType } from "@prisma/client";
import { fail, redirect } from "@sveltejs/kit";

export const load = async (event) => {


  const session =
    (await event.locals.getSession()) as EnhancedSessionType | null;

  if (!session?.customerData.customerType) {
    throw redirect(302, "/customer-information");
  }

  //   let subscriptionTypes = await prisma.subscriptionTypeMultiplier.findMany({
  //     where: { deletedAt: null },
  //     orderBy: { type: 'asc' }
  // });


  const regions = await prisma.region.findMany({
    where: { deletedAt: null },
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
  const customer = await prisma.customer.findUnique({
    where: { userId: session.customerData.id },
    include: { User: true }
  });

  return {
    regions,
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


// Helper function to create order milestones
function createOrderMilestones(
  pickUpLocation: string,
  pickUpMapLocation: string,
  dropOffLocation: string,
  dropOffMapLocation: string,
  warehouses: Array<{ id: number; name: string; mapLocation: string; city: string }>
) {
  const milestones = [];

  // Add pickup milestone
  milestones.push({
    description: `Pick up from ${pickUpLocation}`,
    coordinates: pickUpMapLocation, // Changed from coordinate to coordinates
    warehouseId: -1,
  });

  // Add warehouse milestones
  for (let i = 0; i < warehouses.length; i++) {
    const warehouse = warehouses[i];
    const prevWarehouse = i > 0 ? warehouses[i - 1] : null;

    if (i === 0) {
      // First warehouse after pickup
      milestones.push({
        description: `Take to ${warehouse.name} warehouse`,
        coordinates: warehouse.mapLocation, // Changed from coordinate to coordinates
        warehouseId: warehouse.id,
      });
    } else {
      // Transit between warehouses
      milestones.push({
        description: `Take from ${prevWarehouse?.name} to ${warehouse.name} warehouse`,
        coordinates: warehouse.mapLocation, // Changed from coordinate to coordinates
        warehouseId: warehouse.id,
      });
    }
  }

  // Add dropoff milestone
  milestones.push({
    description: `Take to drop off - ${dropOffLocation}`,
    coordinates: dropOffMapLocation, // Changed from coordinate to coordinates
    warehouseId: -1,
  });

  // Add final delivery milestone
  milestones.push({
    description: "Deliver Item",
    coordinates: null, // Changed from coordinate to coordinates
    warehouseId: -1,
  });

  return milestones;
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLng = deg2rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in km
  return distance;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}
// Advanced function to find optimal route through warehouses
async function findOptimalWarehouseRoute(
  senderLat: number,
  senderLng: number,
  receiverLat: number,
  receiverLng: number,
  originCity: string,
  destinationCity: string
) {
  // Get all active warehouses
  const allWarehouses = await prisma.warehouse.findMany({
    where: {
      warehouseStatus: "ACTIVE",
      deletedAt: null
    },
    include: {
      region: true // Include region data for city information
    }
  });

  // Process warehouses to include coordinates
  const warehousesWithCoords = allWarehouses.map(warehouse => {
    // Parse coordinates from the mapLocation string
    const [lat, lng] = warehouse.mapLocation ?
      warehouse.mapLocation.split(',').map(Number) :
      [0, 0]; // Default to 0,0 if mapLocation is missing

    return {
      id: warehouse.id,
      name: warehouse.name,
      mapLocation: warehouse.mapLocation || "",
      city: warehouse.region?.name || "", // Use region name as city
      lat,
      lng
    };
  });

  // Filter warehouses by city
  const originWarehouses = warehousesWithCoords.filter(w =>
    w.city.toLowerCase() === originCity.toLowerCase()
  );

  const destinationWarehouses = warehousesWithCoords.filter(w =>
    w.city.toLowerCase() === destinationCity.toLowerCase()
  );

  // For in-city deliveries (same origin and destination)
  if (originCity.toLowerCase() === destinationCity.toLowerCase()) {
    // Find the warehouse nearest to sender
    let nearestToSender = null;
    let shortestDistance = Infinity;

    for (const warehouse of originWarehouses) {
      const distance = calculateDistance(senderLat, senderLng, warehouse.lat, warehouse.lng);
      if (distance < shortestDistance) {
        shortestDistance = distance;
        nearestToSender = warehouse;
      }
    }

    return nearestToSender ? [nearestToSender] : [];
  }

  // For between-cities deliveries
  const routeWarehouses = [];

  // Find nearest warehouse in origin city
  let nearestOriginWarehouse = null;
  let shortestOriginDistance = Infinity;

  for (const warehouse of originWarehouses) {
    const distance = calculateDistance(senderLat, senderLng, warehouse.lat, warehouse.lng);
    if (distance < shortestOriginDistance) {
      shortestOriginDistance = distance;
      nearestOriginWarehouse = warehouse;
    }
  }

  if (nearestOriginWarehouse) {
    routeWarehouses.push(nearestOriginWarehouse);
  }

  // Find nearest warehouse in destination city
  let nearestDestWarehouse = null;
  let shortestDestDistance = Infinity;

  for (const warehouse of destinationWarehouses) {
    const distance = calculateDistance(receiverLat, receiverLng, warehouse.lat, warehouse.lng);
    if (distance < shortestDestDistance) {
      shortestDestDistance = distance;
      nearestDestWarehouse = warehouse;
    }
  }

  if (nearestDestWarehouse) {
    routeWarehouses.push(nearestDestWarehouse);
  }

  return routeWarehouses;
}

// Helper function to find the nearest warehouse
function findNearestWarehouse(
  warehouses: Array<{ id: number; name: string; lat: number; lng: number; city: string }>,
  lat: number,
  lng: number,
  city?: string
) {
  if (warehouses.length === 0) {
    return null;
  }

  // Filter by city if provided
  const filteredWarehouses = city
    ? warehouses.filter(w => w.city.toLowerCase() === city.toLowerCase())
    : warehouses;

  if (filteredWarehouses.length === 0) {
    return null;
  }

  // Calculate distances to all warehouses
  const warehousesWithDistances = filteredWarehouses.map(warehouse => {
    const distance = calculateDistance(lat, lng, warehouse.lat, warehouse.lng);
    return {
      ...warehouse,
      distance,
      mapLocation: `${warehouse.lat},${warehouse.lng}` // Add mapLocation property
    };
  });

  // Sort by distance and return the nearest
  warehousesWithDistances.sort((a, b) => a.distance - b.distance);

  return warehousesWithDistances[0];
}
// Helper function to find intermediate warehouses for long routes
function findIntermediateWarehouses(
  allWarehouses: Array<{ id: number; name: string; lat: number; lng: number; city: string }>,
  originWarehouse: { lat: number; lng: number; city: string },
  destinationWarehouse: { lat: number; lng: number; city: string },
  originCity: string,
  destinationCity: string
) {
  // Filter out warehouses in origin and destination cities
  const intermediateWarehouses = allWarehouses.filter(w =>
    w.city.toLowerCase() !== originCity.toLowerCase() &&
    w.city.toLowerCase() !== destinationCity.toLowerCase()
  );

  if (intermediateWarehouses.length === 0) {
    return [];
  }

  // Calculate the direct path from origin to destination
  const directDistance = calculateDistance(
    originWarehouse.lat,
    originWarehouse.lng,
    destinationWarehouse.lat,
    destinationWarehouse.lng
  );

  // Calculate how "on path" each warehouse is
  const warehousesWithPathScore = intermediateWarehouses.map(warehouse => {
    // Distance from origin to this warehouse
    const distFromOrigin = calculateDistance(
      originWarehouse.lat,
      originWarehouse.lng,
      warehouse.lat,
      warehouse.lng
    );

    // Distance from this warehouse to destination
    const distToDestination = calculateDistance(
      warehouse.lat,
      warehouse.lng,
      destinationWarehouse.lat,
      destinationWarehouse.lng
    );

    // Total path distance through this warehouse
    const totalPathDistance = distFromOrigin + distToDestination;

    // Calculate how much this deviates from the direct path
    // Lower is better - a perfect on-path warehouse would have a deviation of 0
    const pathDeviation = totalPathDistance - directDistance;

    // Calculate a score that considers both deviation and progress along the path
    // We want warehouses that are on-path and make good progress
    const progressRatio = distFromOrigin / directDistance; // 0 to 1 representing progress

    // Ideal progress is around 0.33 and 0.66 for intermediate points
    const progressScore = Math.min(
      Math.abs(progressRatio - 0.33),
      Math.abs(progressRatio - 0.66)
    );

    // Combined score (lower is better)
    const score = (pathDeviation / directDistance) + progressScore;

    return {
      ...warehouse,
      distFromOrigin,
      distToDestination,
      pathDeviation,
      progressRatio,
      score,
      mapLocation: `${warehouse.lat},${warehouse.lng}` // Add mapLocation property
    };
  });

  // Sort by score (lower is better)
  warehousesWithPathScore.sort((a, b) => a.score - b.score);

  // Select up to 2 intermediate warehouses
  // Ideally one around 1/3 of the way and one around 2/3 of the way
  const selectedWarehouses = [];

  // Find a warehouse around 1/3 of the way
  const firstThirdWarehouse = warehousesWithPathScore.find(w =>
    w.progressRatio >= 0.2 && w.progressRatio <= 0.4
  );

  if (firstThirdWarehouse) {
    selectedWarehouses.push(firstThirdWarehouse);
  }

  // Find a warehouse around 2/3 of the way
  const secondThirdWarehouse = warehousesWithPathScore.find(w =>
    w.progressRatio >= 0.6 && w.progressRatio <= 0.8 &&
    (!firstThirdWarehouse || w.id !== firstThirdWarehouse.id)
  );

  if (secondThirdWarehouse) {
    selectedWarehouses.push(secondThirdWarehouse);
  }

  // If we didn't find ideally positioned warehouses, take the best 1-2 by score
  if (selectedWarehouses.length === 0 && warehousesWithPathScore.length > 0) {
    selectedWarehouses.push(warehousesWithPathScore[0]);

    if (warehousesWithPathScore.length > 1) {
      selectedWarehouses.push(warehousesWithPathScore[1]);
    }
  }

  // Sort by progress ratio to ensure they're in order from origin to destination
  selectedWarehouses.sort((a, b) => a.progressRatio - b.progressRatio);

  return selectedWarehouses;
}

// Helper function to get pricing configuration
async function getPricingConfig() {
  // Get all pricing data using the same approach as in the load function
  const [
    cities,
    pricingMatrix,
    packagingFees,
    customerTypeMultipliers,
    subscriptionTypeMultipliers,
    orderTypeMultipliers,
    goodsTypeMultipliers,
    premiumTypeMultipliers,
    inCityPricing,
    vehicleTypeMultipliers,
    additionalFees
  ] = await Promise.all([
    prisma.region.findMany({
      where: { deletedAt: null },
      select: { name: true }
    }),
    prisma.pricingMatrix.findMany({
      where: { deletedAt: null }
    }),
    prisma.packagingFee.findMany({
      where: { deletedAt: null }
    }),
    prisma.customerTypeMultiplier.findMany({
      where: { deletedAt: null }
    }),
    prisma.subscriptionTypeMultiplier.findMany({
      where: { deletedAt: null }
    }),
    prisma.orderTypeMultiplier.findMany({
      where: { deletedAt: null }
    }),
    prisma.goodsTypeMultiplier.findMany({
      where: { deletedAt: null }
    }),
    prisma.premiumTypeMultiplier.findMany({
      where: { deletedAt: null }
    }),
    prisma.inCityPricing.findMany({
      where: { deletedAt: null }
    }),
    prisma.vehicleTypeMultiplier.findMany({
      where: { deletedAt: null }
    }),
    prisma.additionalFee.findMany({
      where: { deletedAt: null }
    })
  ]);

  // Format the data for easy consumption
  const cityNames = cities.map(city => city.name);

  // Format pricing matrix
  const formattedPricingMatrix = pricingMatrix.reduce((acc, entry) => {
    if (!acc[entry.originCity]) {
      acc[entry.originCity] = {};
    }
    acc[entry.originCity][entry.destinationCity] = entry.unitRate;
    return acc;
  }, {} as Record<string, Record<string, number>>);

  // Format packaging fees
  const formattedPackagingFees = packagingFees.reduce((acc, fee) => {
    acc[fee.packagingType] = fee.price;
    return acc;
  }, {} as Record<string, number>);

  // Format customer type multipliers
  const formattedCustomerTypeMultipliers = customerTypeMultipliers.reduce((acc, multiplier) => {
    acc[multiplier.type] = multiplier.multiplier;
    return acc;
  }, {} as Record<string, number>);

  // Format subscription type multipliers
  const formattedSubscriptionTypeMultipliers = subscriptionTypeMultipliers.reduce((acc, multiplier) => {
    acc[multiplier.type] = multiplier.multiplier;
    return acc;
  }, {} as Record<string, number>);

  // Format order type multipliers
  const formattedOrderTypeMultipliers = orderTypeMultipliers.reduce((acc, multiplier) => {
    acc[multiplier.type] = multiplier.multiplier;
    return acc;
  }, {} as Record<string, number>);

  // Format goods type multipliers
  const formattedGoodsTypeMultipliers = goodsTypeMultipliers.reduce((acc, multiplier) => {
    acc[multiplier.type] = multiplier.multiplier;
    return acc;
  }, {} as Record<string, number>);

  // Format premium type multipliers
  const formattedPremiumTypeMultipliers = premiumTypeMultipliers.reduce((acc, multiplier) => {
    acc[multiplier.type] = multiplier.multiplier;
    return acc;
  }, {} as Record<string, number>);

  // Format in-city pricing
  const formattedInCityPricing = inCityPricing.reduce((acc, pricing) => {
    acc[pricing.city] = {
      baseRate: pricing.baseFare,
      perKmRate: pricing.distanceCharge,
      perMinuteRate: pricing.timeCharge,
      // peakHourMultiplier: pricing.peakHourMultiplier
    };
    return acc;
  }, {} as Record<string, any>);

  // Format vehicle type multipliers
  const formattedVehicleTypes = vehicleTypeMultipliers.reduce((acc, multiplier) => {
    if (!acc[multiplier.city]) {
      acc[multiplier.city] = {};
    }
    acc[multiplier.city][multiplier.vehicleType] = multiplier.multiplier;
    return acc;
  }, {} as Record<string, Record<string, number>>);

  // Format additional fees
  const formattedAdditionalFees = additionalFees.reduce((acc, fee) => {
    if (!acc[fee.city]) {
      acc[fee.city] = [];
    }
    acc[fee.city].push({
      name: fee.feeName,
      amount: fee.feeAmount
    });
    return acc;
  }, {} as Record<string, Array<{ name: string; amount: number }>>);

  // Return the complete pricing configuration
  return {
    cities: cityNames,
    pricingMatrix: formattedPricingMatrix,
    packagingFees: formattedPackagingFees,
    customerTypeMultipliers: formattedCustomerTypeMultipliers,
    subscriptionTypeMultipliers: formattedSubscriptionTypeMultipliers,
    orderTypeMultipliers: formattedOrderTypeMultipliers,
    goodsTypeMultipliers: formattedGoodsTypeMultipliers,
    premiumTypeMultipliers: formattedPremiumTypeMultipliers,
    inCityPricing: formattedInCityPricing,
    vehicleTypes: formattedVehicleTypes,
    additionalFees: formattedAdditionalFees
  };
}
export const actions = {
  createOrder: async ({ request, locals }) => {
    const session = await locals.getSession() as EnhancedSessionType;
    if (!session) {
      return fail(400, { errorMessage: "You must be logged in to create an order" });
    }

    const formData = await request.formData();

    // Extract sender information
    const userName = formData.get("userName") as string;
    const phoneNumber = formData.get("phoneNumber") as string;
    const pickUpTime = formData.get("pickUpTime") as string;
    const pickUpLocation = formData.get("pickUpLocation") as string;
    const mapAddress = formData.get("mapAddress") as string;

    // Extract receiver information
    const receiverUsername = formData.get("receiverUsername") as string;
    const receiverPhoneNumber = formData.get("receiverPhoneNumber") as string;
    const receiverEmail = formData.get("receiverEmail") as string;
    const inCity = formData.get("inCity") as string;
    const dropOffTime = formData.get("dropOffTime") as string;
    const dropOffLocation = formData.get("dropOffLocation") as string;
    const dropOffMapAddress = formData.get("dropOffMapAddress") as string;
    const receiverId = formData.get("receiverId") as string;

    // Extract package and pricing information - fix the type casting
    const packageType = formData.get("packageType") as string;
    const orderType = formData.get("orderType") as string;
    const goodsType = formData.get("goodsType") as string;
    const packagingType = formData.get("packagingType") as string;
    const vehicleTypeInput = formData.get("vehicleType") as string;


    // Extract weight and dimensions
    const actualWeight = parseFloat(formData.get("actualWeight") as string) || 0.5;
    const length = parseFloat(formData.get("length") as string) || 0;
    const width = parseFloat(formData.get("width") as string) || 0;
    const height = parseFloat(formData.get("height") as string) || 0;

    // Validate required fields
    if (
      typeof pickUpTime !== "string" ||
      typeof pickUpLocation !== "string" ||
      !mapAddress ||
      typeof mapAddress !== "string" ||
      typeof dropOffTime !== "string" ||
      typeof dropOffLocation !== "string" ||
      typeof inCity !== "string" ||
      typeof receiverPhoneNumber !== "string" ||
      typeof receiverUsername !== "string" ||
      typeof packageType !== "string" ||
      typeof dropOffMapAddress !== "string" ||
      typeof receiverEmail !== "string"
    ) {
      return fail(400, { errorMessage: "Invalid data" });
    }

    // Calculate dimensional weight if dimensions are provided
    let dimensionalWeight = 0;
    if (length > 0 && width > 0 && height > 0) {
      dimensionalWeight = (length * width * height) / 5000;
    }

    // Use the higher of actual weight or dimensional weight as VWF
    const effectiveWeight = Math.max(actualWeight, dimensionalWeight);

    // Extract city information
    const originCity = formData.get("originCity") as string || "Addis Ababa";
    const destinationCity = formData.get("destinationCity") as string || "Addis Ababa";

    // Extract distance and time information (for in-city deliveries)
    const distanceInKm = parseFloat(formData.get("distanceInKm") as string) || 0;
    const estimatedTimeInMinutes = parseInt(formData.get("estimatedTimeInMinutes") as string) || 0;

    try {
      // Get pricing configuration
      const pricingConfig = await getPricingConfig();

      // --- CALCULATE PRICE USING THE EXACT FORMULA ---

      // 1. Determine Customer Type Coefficient (CTC)
      const customerType = session?.customerData?.customerType || "INDIVIDUAL";
      const customerTypeMultiplier = pricingConfig.customerTypeMultipliers[customerType] || 1;

      // 2. Determine Subscription Type Coefficient (STC)
      // Always 1 since the user is logged in (registered)
      const subscriptionTypeMultiplier = 1;

      // 3. Determine Order Type Coefficient (OTC)
      const orderTypeMultiplier = pricingConfig.orderTypeMultipliers[orderType] || 1;

      // 4. Determine Type of Goods Coefficient (TGC)
      const goodsTypeMultiplier = pricingConfig.goodsTypeMultipliers[goodsType] || 1;

      // 5. Determine if user has premium status
      const isPremium = !!session?.customerData?.premium;
      const premiumTypeMultiplier = isPremium
        ? (pricingConfig.premiumTypeMultipliers["PREMIUM"] || 1)
        : 1;

      let baseShippingCost = 0;
      let packagingCost = 0;
      let additionalFees = [];
      let vehicleMultiplier = 1;
      let peakHourMultiplier = 1;

      // 6. Calculate base shipping cost differently based on delivery type
      if (inCity === "0") {
        // --- IN-CITY DELIVERY ---

        // Get the city pricing data or default to Addis Ababa
        const cityPricing = pricingConfig.inCityPricing[originCity] || pricingConfig.inCityPricing["Addis Ababa"];

        if (!cityPricing) {
          throw new Error(`No pricing data available for city: ${originCity}`);
        }

        // Base rate (starting fee)
        baseShippingCost = cityPricing.baseRate || 0;

        // Add distance-based cost
        baseShippingCost += distanceInKm * (cityPricing.perKmRate || 0);

        // Add time-based cost
        baseShippingCost += estimatedTimeInMinutes * (cityPricing.perMinuteRate || 0);

        // Apply vehicle type multiplier if specified
        if (vehicleTypeInput && pricingConfig.vehicleTypes[originCity]) {
          vehicleMultiplier = pricingConfig.vehicleTypes[originCity][vehicleTypeInput] || 1;
        }

        // Check if it's peak hour and apply multiplier
        const currentHour = new Date().getHours();
        if (currentHour >= 17 && currentHour <= 19 && cityPricing.peakHourMultiplier) {
          peakHourMultiplier = cityPricing.peakHourMultiplier;
        }

        // Apply vehicle and peak hour multipliers
        baseShippingCost *= vehicleMultiplier * peakHourMultiplier;

        // Get any additional fees for this city
        additionalFees = pricingConfig.additionalFees[originCity] || [];
      } else {
        // --- BETWEEN-CITIES DELIVERY ---

        // Get the unit rate from the pricing matrix
        const unitRate = pricingConfig.pricingMatrix[originCity]?.[destinationCity];

        if (!unitRate) {
          throw new Error(`No pricing data available for route from ${originCity} to ${destinationCity}`);
        }

        // Apply the formula: UR * VWF
        baseShippingCost = unitRate * effectiveWeight;
      }

      // 7. Apply all multipliers to base shipping cost
      // Formula: Shipping Cost = CTC * STC * TGC * OTC * UR * VWF
      const multipliedShippingCost = baseShippingCost *
        customerTypeMultiplier *
        subscriptionTypeMultiplier *
        orderTypeMultiplier *
        goodsTypeMultiplier *
        premiumTypeMultiplier;

      // 8. Determine packaging cost based on packaging type
      if (packagingType) {
        packagingCost = pricingConfig.packagingFees[packagingType] || 0;
      }

      // 9. Calculate total additional fees
      const totalAdditionalFees = additionalFees.reduce((sum, fee) => sum + fee.amount, 0);

      // 10. Calculate total cost
      // Formula: Total Price = Shipping Cost + Packaging Cost + Additional Fees
      const totalCost = multipliedShippingCost + packagingCost + totalAdditionalFees;

      // --- FIND WAREHOUSE ROUTE ---
      const senderCoords = mapAddress.split(',').map(Number);
      const receiverCoords = dropOffMapAddress.split(',').map(Number);

      // Get all warehouses
      const warehouses = await prisma.warehouse.findMany({
        where: {
          warehouseStatus: "ACTIVE",
        },
        include: {
          region: true,
        },
      });

      // Use turf.js for finding nearest warehouses
      const turf = await import('@turf/turf');
      const senderPoint = turf.point([senderCoords[1], senderCoords[0]]);
      const receiverPoint = turf.point([receiverCoords[1], receiverCoords[0]]);

      const warehousePoints = turf.featureCollection(
        warehouses.map(warehouse => {
          const warehouseLocation = warehouse.mapLocation.split(",");
          return turf.point([
            Number(warehouseLocation[1]),
            Number(warehouseLocation[0])
          ]);
        })
      );

      const nearestToSender = turf.nearestPoint(senderPoint, warehousePoints);
      const nearestToReceiver = turf.nearestPoint(receiverPoint, warehousePoints);

      const nearToSenderWarehouse = warehouses.find((w) => {
        const [wLat, wLng] = w.mapLocation.split(",").map(Number);
        // turf returns [lng, lat] but our DB has [lat, lng]
        return wLat === nearestToSender.geometry.coordinates[1] &&
          wLng === nearestToSender.geometry.coordinates[0];
      });

      const nearToReceiverWarehouse = warehouses.find((w) => {
        const [wLat, wLng] = w.mapLocation.split(",").map(Number);
        // turf returns [lng, lat] but our DB has [lat, lng]
        return wLat === nearestToReceiver.geometry.coordinates[1] &&
          wLng === nearestToReceiver.geometry.coordinates[0];
      });


      // Create order milestones
      let orderMilestones = [];
      const isInCity = inCity === "0";

      if (isInCity) {
        // In-city delivery milestones
        orderMilestones = [
          {
            description: `Pick up from Sender - ${pickUpLocation}`,
            coordinates: mapAddress,
          },
          {
            description: `Take to drop off - ${dropOffLocation}`,
            coordinates: dropOffMapAddress,
            warehouseId: nearToSenderWarehouse?.id,
          },
          { description: "Deliver Item" },
        ];
      } else {
        // Between-cities delivery milestones
        orderMilestones = [
          {
            description: `Pick up from Sender - ${pickUpLocation}`,
            coordinates: mapAddress,
          },
          {
            description: "Take to " + nearToSenderWarehouse?.name + " warehouse",
            coordinates: nearToSenderWarehouse?.mapLocation,
            warehouseId: nearToSenderWarehouse?.id,
          },
          {
            description:
              "Take from " +
              nearToSenderWarehouse?.name +
              " to " +
              nearToReceiverWarehouse?.name +
              " warehouse",
            coordinates: nearToReceiverWarehouse?.mapLocation,
            warehouseId: nearToReceiverWarehouse?.id,
          },
          {
            description: `Take to drop off - ${dropOffLocation}`,
            coordinates: dropOffMapAddress,
            warehouseId: -1,
          },
          { description: "Deliver Item", warehouseId: -1 },
        ];
      }

      // Convert vehicle type enum if needed
      let vehicleType = null;
      if (vehicleTypeInput && inCity === "0") {
        // Convert to Vehicles_vehicleType enum if it matches
        if (['BIKE', 'CAR', 'TRUCK'].includes(vehicleTypeInput)) {
          vehicleType = vehicleTypeInput as Vehicles_vehicleType;
        }
      }

      // --- CREATE ORDER ---
      const orderData = {
        senderCustomerId: Number(session?.customerData.id),
        dropOffPhysicalLocation: dropOffLocation,
        dropOffMapLocation: dropOffMapAddress,
        orderStatus: "UNCLAIMED" as Order_orderStatus,
        packageType: packageType as PackageType,
        paymentStatus: false,
        pickUpMapLocation: mapAddress,
        pickUpPhysicalLocation: pickUpLocation,
        dropOffTime: new Date(dropOffTime),
        pickUpTime: new Date(pickUpTime),
        receiverCustomerId: receiverId ? Number(receiverId) : null,
        receiverEmail: receiverEmail ?? null,
        receiverPhoneNumber: receiverPhoneNumber ?? null,
        receiverName: receiverUsername ?? null,
        isInCity: inCity === "0",
        // lastMile: inCity === "0" ? true : false,

        // Pricing calculation details
        baseShippingCost,
        customerTypeMultiplier: parseFloat(customerTypeMultiplier.toString()),
        subscriptionTypeMultiplier,
        orderTypeMultiplier,
        goodsTypeMultiplier,
        premiumTypeMultiplier,
        vehicleMultiplier,
        peakHourMultiplier,
        multipliedShippingCost,
        packagingCost,
        totalAdditionalFees,
        totalCost,

        // Weight and dimensions
        actualWeight,
        dimensionalWeight: dimensionalWeight > 0 ? dimensionalWeight : null,
        effectiveWeight,

        // Distance and time
        distanceInKm: distanceInKm > 0 ? distanceInKm : null,
        estimatedTimeInMinutes: estimatedTimeInMinutes > 0 ? estimatedTimeInMinutes : null,

        // Cities and characteristics
        originCity,
        destinationCity,
        orderType: orderType as OrderType,
        goodsType: goodsType as GoodsType,
        packagingType: packagingType as PackagingType,
        vehicleType,

        // Milestones
        orderMilestone: {
          createMany: {
            data: orderMilestones.map(milestone => ({
              description: milestone.description,
              coordinates: milestone.coordinates || null,
              warehouseId: milestone.warehouseId === -1 ? null : milestone.warehouseId || null,
            })),
          },
        },
      };

      console.log('Order Creation Data with Types:');
      Object.entries(orderData).forEach(([key, value]) => {
        console.log(`${key}:`, {
          value,
          type: value === null ? 'null' : typeof value,
          isArray: Array.isArray(value),
          isDate: value instanceof Date
        });
      });

      // Also log the raw milestones data
      console.log('\nOrder Milestones Data:');
      console.log(JSON.stringify(orderMilestones, null, 2));

      // Create the order with the logged data
      const newOrder = await prisma.order.create({
        data: orderData
      });


      // --- SEND EMAIL NOTIFICATIONS ---

      // 1. Send email to receiver
      if (!newOrder.receiverCustomerId) {
        // For non-registered receivers, send directly to their provided email
        const emailSentToReceiver = await sendMail(
          newOrder.receiverEmail ?? "",
          "Order coming to you has been created.",
          `An order with id ${newOrder.id} from ${session?.userData.userName}, (${newOrder.receiverPhoneNumber}) is coming to ${newOrder.dropOffPhysicalLocation} from ${newOrder.pickUpPhysicalLocation}`
        );
        console.log(`Email notification sent to receiver: ${newOrder.receiverEmail}`);
      } else {
        // For registered receivers, look up their email
        const user = await prisma.customer.findFirst({
          where: {
            id: newOrder.receiverCustomerId,
          },
          include: {
            User: true,
          },
        });

        if (user?.User.email) {
          const emailSentToReceiver = await sendMail(
            user.User.email,
            "Order coming to you has been created.",
            `An order with id ${newOrder.id} from ${session?.userData.userName}, (${newOrder.receiverPhoneNumber}) is coming to ${newOrder.dropOffPhysicalLocation} from ${newOrder.pickUpPhysicalLocation}`
          );
          console.log(`Email notification sent to registered receiver: ${user.User.email}`);
        }
      }

      // 2. Send confirmation email to sender
      if (session?.userData.email) {
        const emailSentToSender = await sendMail(
          session.userData.email,
          "Your order has been created successfully",
          `Your order with ID ${newOrder.id} has been created successfully. 
           
Package Details:
- Type: ${packageType}
- Pickup: ${pickUpLocation}
- Delivery: ${dropOffLocation}
- Estimated Cost: $${totalCost.toFixed(2)}
           
Your order is being processed and will be picked up soon. You can track your order status in your account.`
        );
        console.log(`Confirmation email sent to sender: ${session.userData.email}`);
      }

      return { newOrder };
    } catch (error) {
      console.error("Error creating order:", error);
      return fail(500, { errorMessage: "Failed to create order: " + (error as Error).message });
    }
  },

  searchCustomer: async (event) => {
    const data = await event.request.formData();
    const query = data.get("searchCustomer");
    const session =
      (await event.locals.getSession()) as EnhancedSessionType | null;

    const customerFound = await prisma.customer.findMany({
      where: {
        id: {
          not: session?.customerData.id,
        },
        OR: [
          {
            User: {
              email: {
                contains: query?.toString(),
              },
              isEmployee: false,
            },
          },
          {
            User: {
              phoneNumber: {
                contains: query?.toString(),
              },
              isEmployee: false,
            },
          },
          {
            User: {
              userName: {
                contains: query?.toString(),
              },
              isEmployee: false,
            },
          },
        ],
      },
      include: {
        User: true,
      },
    });
    return { customerFound };
  },
};
