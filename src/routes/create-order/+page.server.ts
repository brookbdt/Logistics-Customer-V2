import { prisma } from "$lib/utils/prisma";
import { sendMail } from "$lib/utils/send-email.server";
import type { GoodsType, Order_orderStatus, OrderType, PackageType, PackagingType, Vehicles_vehicleType } from "@prisma/client";
import { fail, redirect } from "@sveltejs/kit";
import { createOrderSchema } from "$lib/utils/schemas/create-order";
import { superValidate } from "sveltekit-superforms/server";
import { zod } from 'sveltekit-superforms/adapters';
import { Prisma } from '@prisma/client';



// Define the EnhancedSessionType for better type checking

export const load = async ({ locals, url }) => {
  const form = await superValidate(zod(createOrderSchema));

  const session =
    (await locals.getSession()) as EnhancedSessionType | null;

  if (!session?.customerData.customerType) {
    throw redirect(302, "/customer-information");
  }

  // Handle customer search if query parameter is provided
  const searchQuery = url.searchParams.get('searchCustomer');
  let searchResults = null;

  if (searchQuery && searchQuery.length >= 2) {
    searchResults = await prisma.customer.findMany({
      where: {
        id: {
          not: session.customerData.id,
        },
        OR: [
          {
            User: {
              email: {
                contains: searchQuery,
              },
              isEmployee: false,
            },
          },
          {
            User: {
              phoneNumber: {
                contains: searchQuery,
              },
              isEmployee: false,
            },
          },
          {
            User: {
              userName: {
                contains: searchQuery,
              },
              isEmployee: false,
            },
          },
        ],
      },
      include: {
        User: true,
      },
      take: 5, // Limit results
    });
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
    form,
    regions,
    customer,
    customerSearchResults: searchResults,

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
  destinationCity: string,
  allWarehouses: any[]
) {
  console.log("findOptimalWarehouseRoute called with:", {
    senderLat, senderLng, receiverLat, receiverLng,
    originCity, destinationCity
  });

  // Check if we have any warehouses to work with
  if (!allWarehouses || allWarehouses.length === 0) {
    console.warn("No warehouses provided to findOptimalWarehouseRoute");
    return [];
  }

  console.log(`Using ${allWarehouses.length} active warehouses`);

  // Process warehouses to include coordinates
  const warehousesWithCoords = allWarehouses.map(warehouse => {
    // Parse coordinates from the mapLocation string
    let lat = 0;
    let lng = 0;

    try {
      if (warehouse.mapLocation) {
        const coords = warehouse.mapLocation.split(',');
        if (coords.length === 2) {
          lat = Number(coords[0].trim());
          lng = Number(coords[1].trim());

          // Validate coordinates
          if (isNaN(lat) || isNaN(lng) ||
            Math.abs(lat) > 90 || Math.abs(lng) > 180) {
            console.warn(`Invalid warehouse coordinates: ${warehouse.mapLocation}`);
            lat = 0;
            lng = 0;
          }
        }
      }
    } catch (error) {
      console.error(`Error parsing coordinates for warehouse ${warehouse.id}:`, error);
    }

    return {
      id: warehouse.id,
      name: warehouse.name,
      mapLocation: warehouse.mapLocation || "",
      city: warehouse.region?.name || "Unknown",
      lat,
      lng,
      // Pre-calculate distances to sender and receiver
      distanceToSender: calculateDistance(senderLat, senderLng, lat, lng),
      distanceToReceiver: calculateDistance(receiverLat, receiverLng, lat, lng)
    };
  });

  // Filter out warehouses with invalid coordinates (0,0)
  const validWarehouses = warehousesWithCoords.filter(w =>
    !(w.lat === 0 && w.lng === 0)
  );

  if (validWarehouses.length === 0) {
    console.warn("No warehouses with valid coordinates found");
    return [];
  }

  console.log(`Found ${validWarehouses.length} warehouses with valid coordinates`);

  // Calculate direct distance between sender and receiver
  const directDistance = calculateDistance(senderLat, senderLng, receiverLat, receiverLng);
  console.log(`Direct distance between sender and receiver: ${directDistance.toFixed(2)} km`);

  // Always find the closest warehouse to sender
  let senderWarehouse = validWarehouses[0];
  let minDistanceToSender = senderWarehouse.distanceToSender;

  for (const warehouse of validWarehouses) {
    if (warehouse.distanceToSender < minDistanceToSender) {
      minDistanceToSender = warehouse.distanceToSender;
      senderWarehouse = warehouse;
    }
  }

  console.log(`Closest warehouse to sender: ${senderWarehouse.name} (${senderWarehouse.distanceToSender.toFixed(2)} km)`);

  // For short distances (< 20km), use the same warehouse for both sender and receiver
  if (directDistance < 20) {
    console.log("Short distance delivery - using same warehouse for sender and receiver");
    return [senderWarehouse];
  }

  // For longer distances, find a separate warehouse for the receiver if possible

  // First try to find a warehouse in the destination city
  const destinationCityWarehouses = validWarehouses.filter(w =>
    w.city.toLowerCase() === destinationCity.toLowerCase() &&
    w.id !== senderWarehouse.id
  );

  if (destinationCityWarehouses.length > 0) {
    // Find the closest warehouse in the destination city
    let receiverWarehouse = destinationCityWarehouses[0];
    let minDistanceToReceiver = receiverWarehouse.distanceToReceiver;

    for (const warehouse of destinationCityWarehouses) {
      if (warehouse.distanceToReceiver < minDistanceToReceiver) {
        minDistanceToReceiver = warehouse.distanceToReceiver;
        receiverWarehouse = warehouse;
      }
    }

    console.log(`Using warehouse in destination city for receiver: ${receiverWarehouse.name}`);
    return [senderWarehouse, receiverWarehouse];
  }

  // If no warehouse in destination city, find the closest warehouse to receiver
  let receiverWarehouse = validWarehouses[0];
  let minDistanceToReceiver = receiverWarehouse.distanceToReceiver;

  for (const warehouse of validWarehouses) {
    if (warehouse.id !== senderWarehouse.id &&
      warehouse.distanceToReceiver < minDistanceToReceiver) {
      minDistanceToReceiver = warehouse.distanceToReceiver;
      receiverWarehouse = warehouse;
    }
  }

  // If we found a different warehouse for receiver, use it
  if (receiverWarehouse.id !== senderWarehouse.id) {
    console.log(`Using different warehouse for receiver: ${receiverWarehouse.name}`);
    return [senderWarehouse, receiverWarehouse];
  }

  // Otherwise, just use the sender warehouse for both
  console.log("Using same warehouse for both sender and receiver");
  return [senderWarehouse];
}

// Helper function to find the nearest warehouse - improved version
function findNearestWarehouse(
  warehouses: Array<{ id: number; name: string; lat: number; lng: number; city: string; mapLocation?: string }>,
  lat: number,
  lng: number,
  city?: string
) {
  console.log("findNearestWarehouse called with:", {
    lat, lng, city,
    warehousesCount: warehouses?.length || 0
  });

  // Validate input
  if (!warehouses || warehouses.length === 0) {
    console.warn("No warehouses provided to findNearestWarehouse");
    return null;
  }

  if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    console.warn(`Invalid coordinates provided to findNearestWarehouse: (${lat}, ${lng})`);
    lat = 0;
    lng = 0;
  }

  // Filter to warehouses with valid coordinates
  const validWarehouses = warehouses.filter(w => {
    return (w && w.lat !== undefined && w.lng !== undefined &&
      !isNaN(w.lat) && !isNaN(w.lng) &&
      !(w.lat === 0 && w.lng === 0));
  });

  if (validWarehouses.length === 0) {
    console.warn("No warehouses with valid coordinates found");
    return null;
  }

  // Calculate distances to all warehouses
  const warehousesWithDistances = validWarehouses.map(warehouse => {
    try {
      const distance = calculateDistance(lat, lng, warehouse.lat, warehouse.lng);
      return {
        ...warehouse,
        distance,
        mapLocation: warehouse.mapLocation || `${warehouse.lat},${warehouse.lng}`
      };
    } catch (error) {
      console.error(`Error calculating distance to warehouse ${warehouse.id}:`, error);
      return {
        ...warehouse,
        distance: Infinity,
        mapLocation: warehouse.mapLocation || `${warehouse.lat},${warehouse.lng}`
      };
    }
  });

  // Sort by distance
  warehousesWithDistances.sort((a, b) => a.distance - b.distance);

  console.log("Top 3 closest warehouses:",
    warehousesWithDistances.slice(0, 3).map(w => ({
      id: w.id,
      name: w.name,
      city: w.city,
      distance: w.distance.toFixed(2)
    }))
  );

  // If city is provided, check if any of the top 3 closest warehouses match it
  if (city) {
    console.log(`Looking for warehouses in city: ${city}`);
    const closestWithMatchingCity = warehousesWithDistances
      .slice(0, 3)
      .find(w => w.city?.toLowerCase() === city.toLowerCase());

    if (closestWithMatchingCity) {
      console.log("Found warehouse with matching city among closest 3:", closestWithMatchingCity);
      return closestWithMatchingCity;
    }
  }

  // If no city match was found or city wasn't provided, just return the closest
  console.log("Using nearest warehouse:", warehousesWithDistances[0]);
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

// Update the geocoding function to accept warehouses as a parameter
async function geocodeCityFromCoordinates(
  lat: number,
  lng: number,
  warehouses?: any[]
): Promise<string | null> {
  try {
    let warehousesToUse = warehouses;

    // If warehouses weren't passed in, fetch them
    if (!warehousesToUse) {
      warehousesToUse = await prisma.warehouse.findMany({
        where: {
          warehouseStatus: "ACTIVE",
          deletedAt: null
        },
        include: {
          region: true
        }
      });
    }

    if (!warehousesToUse || warehousesToUse.length === 0) {
      console.warn("No warehouses found for geocoding");
      return null;
    }

    // Find closest warehouse by coordinates, not by city name
    const warehousesWithCoords = warehousesToUse.map(warehouse => {
      const [warehouseLat, warehouseLng] = warehouse.mapLocation ?
        warehouse.mapLocation.split(',').map(Number) :
        [0, 0];

      const distance = calculateDistance(lat, lng, warehouseLat, warehouseLng);

      return {
        city: warehouse.region?.name || "Unknown",
        lat: warehouseLat,
        lng: warehouseLng,
        distance
      };
    });

    // Sort by distance
    warehousesWithCoords.sort((a, b) => a.distance - b.distance);

    const closestWarehouse = warehousesWithCoords[0];
    console.log(`Geocoded (${lat}, ${lng}) to city: ${closestWarehouse.city} (distance: ${closestWarehouse.distance.toFixed(2)} km)`);

    return closestWarehouse.city;
  } catch (error) {
    console.error("Error geocoding coordinates to city:", error);
    return null;
  }
}

export const actions = {
  createOrder: async ({ request, locals }) => {
    console.log("Starting createOrder action");
    const session = (await locals.getSession()) as EnhancedSessionType || null;
    if (!session) {
      console.log("No session found, returning error");
      return fail(400, { errorMessage: "You must be logged in to create an order" });
    }

    // Validate form data using superValidate
    const form = await superValidate(request, zod(createOrderSchema));

    // Check if form is valid
    if (!form.valid) {
      console.log("Form validation failed", form.errors);
      return fail(400, { form, errorMessage: "Invalid form data" });
    }

    console.log("Form is valid, proceeding with order creation");
    const formData = form.data;

    // Extract price breakdown data directly from form
    const priceBreakdown = formData.priceBreakdown || {};

    // Log key form data for debugging
    console.log("Order data summary:", {
      packageType: formData.packageType,
      pickUpLocation: formData.pickUpLocation,
      dropOffLocation: formData.dropOffLocation,
      mapAddress: formData.mapAddress,
      dropOffMapAddress: formData.dropOffMapAddress,
      totalCost: formData.totalCost
    });

    // Extract all necessary data from form
    const {
      userName,
      phoneNumber,
      pickUpTime,
      pickUpLocation,
      mapAddress,
      receiverUsername,
      receiverPhoneNumber,
      receiverEmail,
      inCity,
      dropOffLocation,
      dropOffMapAddress,
      receiverId,
      packageType,
      orderType,
      goodsType,
      packagingType,
      vehicleType: vehicleTypeInput,
      paymentOption,
      actualWeight = 0.5,
      originCity: formOriginCity = "Addis Ababa",
      destinationCity: formDestinationCity = "Addis Ababa",
      distanceInKm = 0,
      estimatedTimeInMinutes = 0,
      totalCost
    } = formData;

    // Create variables that can be updated by geocoding
    let originCity = formOriginCity;
    let destinationCity = formDestinationCity;

    try {
      console.log("Starting transaction for order creation");
      // Store email data outside the transaction
      let emailData: {
        orderForEmails: any;
        receiverEmail: string | null;
        userName: string;
        phoneNumber: string;
        pickUpPhysicalLocation: string;
        dropOffPhysicalLocation: string;
        senderEmail: string | null;
        packageType: string;
        pickUpLocation: string;
        dropOffLocation: string;
        totalCost: number;
      } | null = null;

      // Execute all database operations in a transaction
      const result = await prisma.$transaction(async (tx) => {
        console.log("Inside transaction");
        // --- VALIDATE COORDINATES ---
        let senderCoords: number[];
        let receiverCoords: number[];

        try {
          // Parse and validate sender coordinates
          senderCoords = mapAddress.split(',').map(coord => {
            const num = Number(coord.trim());
            if (isNaN(num)) throw new Error(`Invalid sender coordinate: ${coord}`);
            return num;
          });

          // Parse and validate receiver coordinates
          receiverCoords = dropOffMapAddress.split(',').map(coord => {
            const num = Number(coord.trim());
            if (isNaN(num)) throw new Error(`Invalid receiver coordinate: ${coord}`);
            return num;
          });

          if (senderCoords.length !== 2) {
            throw new Error(`Expected 2 sender coordinates, got ${senderCoords.length}`);
          }

          if (receiverCoords.length !== 2) {
            throw new Error(`Expected 2 receiver coordinates, got ${receiverCoords.length}`);
          }

          // Validate coordinate ranges
          const [senderLat, senderLng] = senderCoords;
          const [receiverLat, receiverLng] = receiverCoords;

          if (Math.abs(senderLat) > 90 || Math.abs(senderLng) > 180) {
            throw new Error(`Invalid sender coordinates: [${senderLat}, ${senderLng}]`);
          }

          if (Math.abs(receiverLat) > 90 || Math.abs(receiverLng) > 180) {
            throw new Error(`Invalid receiver coordinates: [${receiverLat}, ${receiverLng}]`);
          }
        } catch (error) {
          console.error("Coordinate validation error:", error);
          return fail(400, { form, errorMessage: `Coordinate validation error: ${(error as Error).message}` });
        }

        // --- FIND WAREHOUSES ---
        console.log("Finding warehouses");
        // Get all active warehouses ONCE
        const warehouses = await tx.warehouse.findMany({
          where: {
            warehouseStatus: "ACTIVE",
            deletedAt: null
          },
          include: {
            region: true,
          },
        });

        if (warehouses.length === 0) {
          console.error("No active warehouses found");
          return fail(500, { form, errorMessage: "No active warehouses found in the system" });
        }

        console.log(`Found ${warehouses.length} active warehouses`);

        // --- GEOCODE CITIES FROM COORDINATES ---
        console.log("Geocoding origin and destination cities from coordinates");
        try {
          const geocodedOriginCity = await geocodeCityFromCoordinates(senderCoords[0], senderCoords[1], warehouses);
          const geocodedDestinationCity = await geocodeCityFromCoordinates(receiverCoords[0], receiverCoords[1], warehouses);

          console.log(`Geocoded origin city: ${geocodedOriginCity || "Not found"}`);
          console.log(`Geocoded destination city: ${geocodedDestinationCity || "Not found"}`);

          // Use geocoded cities if available, otherwise fall back to form data
          if (geocodedOriginCity) {
            originCity = geocodedOriginCity;
          }

          if (geocodedDestinationCity) {
            destinationCity = geocodedDestinationCity;
          }
        } catch (error) {
          console.error("Error during geocoding:", error);
          // Continue with the original city names from the form
        }

        // --- FIND OPTIMAL WAREHOUSE ROUTE ---
        console.log(`Finding optimal route using cities: origin=${originCity}, destination=${destinationCity}`);
        const optimalWarehouses = await findOptimalWarehouseRoute(
          senderCoords[0],
          senderCoords[1],
          receiverCoords[0],
          receiverCoords[1],
          originCity,
          destinationCity,
          warehouses // Pass warehouses to the function
        );

        console.log("Optimal warehouses:", optimalWarehouses);

        // Initialize warehouse variables
        let nearToSenderWarehouse = null;
        let nearToReceiverWarehouse = null;

        // Check if we found any warehouses
        if (optimalWarehouses && optimalWarehouses.length > 0) {
          console.log("Using warehouses from optimal route finder");
          nearToSenderWarehouse = optimalWarehouses[0];

          if (optimalWarehouses.length > 1) {
            nearToReceiverWarehouse = optimalWarehouses[1];
          } else {
            // If only one warehouse was found, use it for both
            nearToReceiverWarehouse = optimalWarehouses[0];
          }
        } else {
          console.warn("Optimal route finding failed, using fallback method");

          // FALLBACK: Use the first warehouse as sender warehouse
          if (warehouses.length > 0) {
            const firstWarehouse = warehouses[0];
            console.log(`Using first warehouse as fallback: ${firstWarehouse.name} (ID: ${firstWarehouse.id})`);

            // Create a warehouse object with all needed properties
            nearToSenderWarehouse = {
              id: firstWarehouse.id,
              name: firstWarehouse.name,
              mapLocation: firstWarehouse.mapLocation || "",
              city: firstWarehouse.region?.name || "Unknown"
            };

            // Use the same warehouse for receiver
            nearToReceiverWarehouse = nearToSenderWarehouse;
          } else {
            console.error("Critical error: No warehouses available");
            return fail(500, { form, errorMessage: "No warehouses are available in the system" });
          }
        }

        console.log("Final sender warehouse:", nearToSenderWarehouse);
        console.log("Final receiver warehouse:", nearToReceiverWarehouse);

        // Additional null checking to ensure we have valid warehouses
        if (!nearToSenderWarehouse || !nearToSenderWarehouse.id) {
          console.error("Invalid sender warehouse");
          return fail(500, { form, errorMessage: "Could not determine a valid warehouse for sender location" });
        }

        if (!nearToReceiverWarehouse || !nearToReceiverWarehouse.id) {
          console.error("Invalid receiver warehouse, using sender warehouse");
          nearToReceiverWarehouse = nearToSenderWarehouse;
        }

        // Determine if this is an in-city delivery
        const isInCityBool = inCity === "1";

        // --- CREATE ORDER MILESTONES ---
        const orderMilestones = [];

        // Standard milestone sequence for all orders
        orderMilestones.push(
          {
            description: "Order Created",
            coordinates: mapAddress,
            warehouseId: nearToSenderWarehouse.id,
            isCompleted: true, // This milestone is completed when order is created
            executionOrder: 1
          },
          {
            description: "Order Accepted",
            coordinates: mapAddress,
            warehouseId: nearToSenderWarehouse.id,
            executionOrder: 2
          },
          {
            description: "Order Assigned",
            coordinates: mapAddress,
            warehouseId: nearToSenderWarehouse.id,
            executionOrder: 3
          },
          {
            description: "Items Collected",
            coordinates: mapAddress,
            warehouseId: nearToSenderWarehouse.id,
            executionOrder: 4
          }
        );

        // Add appropriate transit milestone based on in-city or between-cities
        if (isInCityBool) {
          orderMilestones.push({
            description: "In Transit",
            coordinates: mapAddress,
            warehouseId: nearToSenderWarehouse.id,
            executionOrder: 5
          });
        } else {
          orderMilestones.push({
            description: `Shipped (from ${originCity} to ${destinationCity})`,
            coordinates: nearToReceiverWarehouse.mapLocation,
            warehouseId: nearToReceiverWarehouse.id, // This is safe now because we've ensured it's not null
            executionOrder: 5
          });
        }

        // Add final milestones
        orderMilestones.push(
          {
            description: "Delivered to Customer",
            coordinates: dropOffMapAddress,
            warehouseId: isInCityBool ? nearToSenderWarehouse.id : nearToReceiverWarehouse.id, // This is safe now
            executionOrder: 6,
            isLastMilestone: true
          },
          // {
          //   description: "Returned",
          //   coordinates: null,
          //   warehouseId: null,
          //   executionOrder: 7
          // }
        );

        // --- VALIDATE AND PREPARE ORDER DATA ---

        // Convert vehicle type enum if needed
        let vehicleType = null;
        if (vehicleTypeInput) {
          // Convert to Vehicles_vehicleType enum if it matches
          if (['BIKE', 'CAR', 'TRUCK'].includes(vehicleTypeInput)) {
            vehicleType = vehicleTypeInput as Vehicles_vehicleType;
          }
        }

        // Calculate dimensional weight if dimensions are provided
        let dimensionalWeight = 0;
        if (formData.length && formData.width && formData.height) {
          try {
            const length = typeof formData.length === 'number' ?
              formData.length : parseFloat(String(formData.length));

            const width = typeof formData.width === 'number' ?
              formData.width : parseFloat(String(formData.width));

            const height = typeof formData.height === 'number' ?
              formData.height : parseFloat(String(formData.height));

            if (isNaN(length) || isNaN(width) || isNaN(height)) {
              console.warn("Invalid dimensions provided, using default dimensional weight");
            } else if (length <= 0 || width <= 0 || height <= 0) {
              console.warn("Dimensions must be positive, using default dimensional weight");
            } else {
              dimensionalWeight = (length * width * height) / 5000;
            }
          } catch (error) {
            console.warn("Error calculating dimensional weight:", error);
          }
        }

        // Use the higher of actual weight or dimensional weight as effective weight
        const effectiveWeight = Math.max(actualWeight, dimensionalWeight);

        // Server-side price calculation/validation
        // (In a production system, you would recalculate all prices here)
        const pricingConfig = await getPricingConfig();

        // Validate total cost against pricing configuration
        // This is just a basic validation - in production, you would do a complete calculation
        if (totalCost <= 0) {
          return fail(400, { form, errorMessage: "Invalid total cost: must be greater than zero" });
        }

        // --- CREATE ORDER ---
        console.log("Creating order with the following data:", {
          senderCustomerId: Number(session?.customerData.id),
          packageType: packageType,
          totalCost: totalCost,
          isInCity: isInCityBool,
        });

        const orderData = {
          senderCustomerId: Number(session?.customerData.id),
          dropOffPhysicalLocation: dropOffLocation,
          dropOffMapLocation: dropOffMapAddress,
          orderStatus: "BEING_REVIEWED" as Order_orderStatus,
          packageType: packageType as PackageType,
          paymentStatus: false,
          paymentOption: paymentOption,
          pickUpMapLocation: mapAddress,
          pickUpPhysicalLocation: pickUpLocation,
          dropOffTime: formData.dropOffTime || null,
          pickUpTime: pickUpTime || null,
          receiverCustomerId: receiverId ? Number(receiverId) : null,
          receiverEmail: receiverEmail ?? null,
          receiverPhoneNumber: receiverPhoneNumber ?? null,
          receiverName: receiverUsername ?? null,
          isInCity: isInCityBool,

          // Pricing calculation details
          baseShippingCost: priceBreakdown.baseShippingCost || 0,
          customerTypeMultiplier: priceBreakdown.customerTypeMultiplier || 1,
          subscriptionTypeMultiplier: priceBreakdown.subscriptionTypeMultiplier || 1,
          orderTypeMultiplier: priceBreakdown.orderTypeMultiplier || 1,
          goodsTypeMultiplier: priceBreakdown.goodsTypeMultiplier || 1,
          premiumTypeMultiplier: priceBreakdown.premiumTypeMultiplier || 1,
          vehicleMultiplier: priceBreakdown.vehicleTypeMultiplier || 1,
          peakHourMultiplier: 1,
          multipliedShippingCost: priceBreakdown.multipliedShippingCost || 0,
          packagingCost: priceBreakdown.packagingCost || 0,
          totalAdditionalFees: priceBreakdown.totalAdditionalFees || 0,
          totalCost: totalCost || 0,

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

          vehicleType,
          // Add this field specifically for real-time notifications
          // This doesn't create an Inventory record, it's just for notifications
          nearToSenderWarehouseId: nearToSenderWarehouse.id,

          // Milestones
          orderMilestone: {
            createMany: {
              data: orderMilestones.map(milestone => ({
                description: milestone.description,
                coordinates: milestone.coordinates,
                warehouseId: milestone.warehouseId,
                isCompleted: milestone.isCompleted || false,
                executionOrder: milestone.executionOrder,
                isLastMilestone: milestone.isLastMilestone || false
              })),
            },
          },
        };

        // Create the order using the transaction
        const newOrder = await tx.order.create({
          data: orderData
        }).catch(err => {
          console.error("Error creating order in database:", err);
          throw err;
        });

        console.log("Order created successfully with ID:", newOrder.id);

        // Create customer notifications
        console.log("Creating notifications");

        // Create customer notifications for both sender and receiver (if applicable)
        await tx.customerNotification.create({
          data: {
            customerId: Number(session?.customerData.id),
            title: "Order Created Successfully",
            content: `Your order #${newOrder.id} has been created successfully and is being processed.`,
            type: "ORDER_CREATED",
            orderId: newOrder.id,
            metadata: JSON.stringify({
              order_id: newOrder.id,
              order_status: newOrder.orderStatus,
              pickup_location: pickUpLocation,
              dropoff_location: dropOffLocation,
            })
          }
        });
        // Create employee notifications for both sender and receiver (if applicable)
        await tx.employeeNotification.create({
          data: {
            // employeeId: Number(session?.userData.id),
            warehouseId: nearToSenderWarehouse.id,
            title: "Order Created Successfully",
            content: `New order #${newOrder.id} has been assigned to ${nearToSenderWarehouse.name}.`,
            type: "ORDER_CREATED",
            orderId: newOrder.id,
            updatedAt: new Date(),
            employeeId: null, // Explicitly set to null since it's required by Prisma validation
            metadata: JSON.stringify({
              order_id: newOrder.id,
              order_status: newOrder.orderStatus,
              pickup_location: pickUpLocation,
              dropoff_location: dropOffLocation,
            })
          }
        });

        // Notify receiver if they are a registered customer
        if (receiverId) {
          await tx.customerNotification.create({
            data: {
              customerId: Number(receiverId),
              title: "New Order Coming Your Way",
              content: `An order #${newOrder.id} from ${session?.userData.userName} is being sent to you.`,
              type: "ORDER_RECEIVED",
              orderId: newOrder.id,
              metadata: JSON.stringify({
                order_id: newOrder.id,
                order_status: newOrder.orderStatus,
                sender_name: session?.userData.userName,
                sender_phone: session?.userData.phoneNumber,
              })
            }
          });
        }

        // --- SEND EMAIL NOTIFICATIONS ---
        // Note: We're moving email sending completely outside the transaction
        // Just store the data needed for emails
        emailData = {
          orderForEmails: newOrder,
          receiverEmail: newOrder.receiverEmail,
          userName: session?.userData.userName || '',
          phoneNumber: session?.userData.phoneNumber || '',
          pickUpPhysicalLocation: newOrder.pickUpPhysicalLocation,
          dropOffPhysicalLocation: newOrder.dropOffPhysicalLocation,
          senderEmail: session?.userData.email || null,
          packageType,
          pickUpLocation,
          dropOffLocation,
          totalCost
        };

        console.log("Transaction completed successfully, returning data");

        // Return order data
        return {
          form,
          success: true,
          newOrder: true,
          orderId: newOrder.id,
          message: "Order created successfully"
        };
      }, {
        // Set longer timeout for transaction (default is 5000ms)
        timeout: 30000, // Increased to 30 seconds
        // Add additional transaction options as needed
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      });

      // After transaction is committed, send realtime notifications with a delay
      try {
        // Add a small delay to ensure the transaction is fully committed before trying to fetch the order
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check if we have access to the socket notification function
        if (locals.notifyNewOrder && result && 'success' in result && result.orderId) {
          // Notify all connected clients about the new order
          await locals.notifyNewOrder(result.orderId);
          console.log(`Real-time notification sent for order ${result.orderId}`);
        }
      } catch (socketError) {
        // Don't fail the request if the socket notification fails
        console.error("Failed to send real-time notification:", socketError);
      }

      // Send emails outside of transaction
      if (emailData && emailData !== null) {
        try {
          // 1. Send email to receiver if they have an email
          if (emailData.receiverEmail) {
            await sendMail(
              emailData.receiverEmail,
              "Order coming to you has been created",
              `An order with id ${emailData.orderForEmails.id} from ${emailData.userName}, (${emailData.phoneNumber}) is coming to ${emailData.dropOffPhysicalLocation} from ${emailData.pickUpPhysicalLocation}`
            );
            console.log(`Email notification sent to receiver: ${emailData.receiverEmail}`);
          }

          // 2. Send confirmation email to sender
          if (emailData.senderEmail) {
            await sendMail(
              emailData.senderEmail,
              "Your order has been created successfully",
              `Your order with ID ${emailData.orderForEmails.id} has been created successfully. 
           
Package Details:
- Type: ${emailData.packageType}
- Pickup: ${emailData.pickUpLocation}
- Delivery: ${emailData.dropOffLocation}
- Estimated Cost: $${emailData.totalCost.toFixed(2)}
           
Your order is being processed and will be picked up soon. You can track your order status in your account.`
            );
            console.log(`Confirmation email sent to sender: ${emailData.senderEmail}`);
          }
        } catch (emailError) {
          // Log email errors but don't fail the request
          console.error("Error sending email notifications outside transaction:", emailError);
        }
      }

      return result;
    } catch (error) {
      if (error instanceof Response) {
        // If this is our redirect response, just rethrow it
        console.log("Caught redirect response, rethrowing");
        throw error;
      }
      console.error("Error creating order:", error);
      return fail(500, { form, errorMessage: "Failed to create order: " + (error as Error).message });
    }
  },
};




