/**
 * Pricing utility for calculating order prices
 * This centralizes all pricing logic to ensure consistency across the application
 */

// Define types for pricing configuration
export interface PricingConfig {

    cities: string[];
    pricingMatrix: Record<string, Record<string, number>>;
    packagingFees: Record<string, number>;
    multipliers: {
        customerType: Record<string, number>;
        subscriptionType?: Record<string, number>;
        orderType: Record<string, number>;
        goodsType: Record<string, number>;
    };
    inCityPricing: Record<string, {
        baseFare: number;
        distanceCharge: number;
        timeCharge: number;
        cancellationRate: number;
        baseRatePerKm?: number;
        minimumFare?: number;
        peakHourMultiplier?: number;
    }>;
    vehicleTypes: Record<string, Record<string, number>>;
    additionalFees: Record<string, Array<{
        name: string;
        amount: number;
        description: string;
    }>>;
    defaultRatePerKm?: number;
    minimumCharge?: number;
    subscriptionTypes?: Record<string, number>;
    premiumTypes?: Record<string, number>;
}

// Define types for price breakdown
export interface PriceBreakdown {
    baseShippingCost: number;
    effectiveWeight: number;
    customerTypeMultiplier: number;
    subscriptionTypeMultiplier: number;
    orderTypeMultiplier: number;
    goodsTypeMultiplier: number;
    premiumTypeMultiplier: number;
    vehicleTypeMultiplier: number;
    multipliedShippingCost: number;
    packagingCost: number;
    additionalFees: {
        name: string;
        amount: number;
    }[];
    totalAdditionalFees: number;
    totalCost: number;
}

// Define types for pricing parameters
export interface PricingParams {
    // Location info
    deliveryType: "IN_CITY" | "BETWEEN_CITIES";
    originCity: string;
    destinationCity: string;
    distanceInKm: number;
    estimatedTimeInMinutes?: number;

    // Customer info
    customerType: string;
    hasSubscription: boolean;
    isPremium?: boolean;

    // Order details
    orderType: string;
    goodsType: string;
    packagingType: string;

    // Package details
    actualWeight: number;
    dimensionalWeight: number;

    // Optional vehicle type for in-city deliveries
    vehicleType?: string;
}

/**
 * Helper function to normalize city names for consistent lookup
 * @param cityName The city name to normalize
 * @param cityList Optional list of valid cities to match against
 * @returns Normalized city name
 */
export function normalizeCity(cityName: string, cityList?: string[]): string {
    console.log("cityName", cityName);
    if (!cityName) return "";
    // Trim and convert to title case
    const normalized = cityName.trim();

    // If we have a city list, try to find a case-insensitive match
    if (cityList && cityList.length > 0) {
        const match = cityList.find(city =>
            city.toLowerCase() === normalized.toLowerCase());
        if (match) return match; // Return the exact case from the list
    }

    return normalized;
}

/**
 * Extract city name from a full address string
 * @param address The full address string
 * @param cityList Optional list of valid cities to match against
 * @returns Extracted city name or default value
 */
export function extractCityFromAddress(address: string, cityList?: string[], defaultCity: string = "Default City Used"): string {
    if (!address) return defaultCity;

    // Try to extract city from the last part of the address
    const parts = address.split(",");
    if (parts.length > 0) {
        // Try the last part first
        const lastPart = parts[parts.length - 1].trim();

        // Check if this matches a known city in our list
        if (cityList && cityList.includes(lastPart)) {
            return lastPart;
        }

        // If we have at least two parts, try the second-to-last part
        if (parts.length > 1) {
            const secondLastPart = parts[parts.length - 2].trim();
            if (cityList && cityList.includes(secondLastPart)) {
                return secondLastPart;
            }
        }

        // Try to find any part that matches a city in our list
        if (cityList) {
            for (const part of parts) {
                const trimmedPart = part.trim();
                if (cityList.includes(trimmedPart)) {
                    return trimmedPart;
                }

                // Also try case-insensitive matching
                const match = cityList.find(city =>
                    city.toLowerCase() === trimmedPart.toLowerCase());
                if (match) {
                    return match;
                }
            }
        }
    }

    // Default to provided default city if we couldn't extract one
    return defaultCity;
}

/**
 * Check if a route between two cities is available in the pricing matrix
 * @param originCity Origin city name
 * @param destinationCity Destination city name
 * @param pricingConfig Pricing configuration
 * @returns Boolean indicating if the route is available
 */
export function isRouteAvailable(
    originCity: string,
    destinationCity: string,
    pricingConfig: PricingConfig
): boolean {
    if (!originCity || !destinationCity) return false;

    // Normalize cities for consistent lookup
    const normalizedOrigin = normalizeCity(originCity, pricingConfig.cities);
    const normalizedDestination = normalizeCity(destinationCity, pricingConfig.cities);

    // If both cities are the same and in config, it's an in-city delivery
    if (normalizedOrigin.toLowerCase() === normalizedDestination.toLowerCase()) {
        return pricingConfig.cities.some(city =>
            city.toLowerCase() === normalizedOrigin.toLowerCase());
    }

    // Check if there's a route in the pricing matrix
    const originPricing = pricingConfig.pricingMatrix[normalizedOrigin];
    if (!originPricing) return false;

    // Check if the destination city is in the pricing matrix for this origin
    return Object.keys(originPricing).some(
        city => city.toLowerCase() === normalizedDestination.toLowerCase()
    );
}

/**
 * Calculate the price for an order based on the provided parameters and pricing configuration
 */
export function calculatePrice(
    params: PricingParams,
    pricingConfig: PricingConfig
): PriceBreakdown {
    try {
        // Initialize variables
        let baseShippingCost = 0;
        let packagingCost = 0;
        let additionalFees: { name: string; amount: number }[] = [];
        let vehicleTypeMultiplier = 1;

        // Normalize city names for consistent lookup
        const normalizedOriginCity = normalizeCity(params.originCity, pricingConfig.cities);
        const normalizedDestinationCity = normalizeCity(params.destinationCity, pricingConfig.cities);

        // Get customer type multiplier - default to 1 if not found
        const customerTypeMultiplier =
            pricingConfig.multipliers?.customerType?.[params.customerType] || 1;

        // Get subscription type multiplier - only apply if it exists in config
        const subscriptionType = params.hasSubscription ? "REGISTERED" : "UNREGISTERED";
        const subscriptionTypeMultiplier =
            (pricingConfig.subscriptionTypes && pricingConfig.subscriptionTypes[subscriptionType]) ||
            pricingConfig.multipliers?.subscriptionType?.[subscriptionType] || 1;

        // Get order type multiplier - default to 1 if not found
        const orderTypeMultiplier =
            pricingConfig.multipliers?.orderType?.[params.orderType] || 1;

        // Get goods type multiplier - default to 1 if not found
        const goodsTypeMultiplier =
            pricingConfig.multipliers?.goodsType?.[params.goodsType] || 1;

        // Get premium type multiplier - default to 1 if not found or not premium
        let premiumTypeMultiplier = 1;
        if (params.isPremium && pricingConfig.premiumTypes) {
            const premiumType = `PREMIUM_${params.customerType}`;
            premiumTypeMultiplier = pricingConfig.premiumTypes[premiumType] || 1;
        }

        // Get packaging fee - default to 0 if not found
        packagingCost = pricingConfig.packagingFees?.[params.packagingType] || 0;

        // Calculate effective weight (higher of actual or dimensional)
        const effectiveWeight = Math.max(params.actualWeight, params.dimensionalWeight);

        // Calculate base shipping cost based on delivery type
        if (params.deliveryType === "IN_CITY") {
            // In-city pricing based on distance, time, and vehicle type
            const cityPricing = pricingConfig.inCityPricing?.[normalizedOriginCity];

            if (!cityPricing) {
                console.warn(`No in-city pricing found for ${normalizedOriginCity}, using default`);
                // Use default pricing if specific city pricing not found
                baseShippingCost = params.distanceInKm * (pricingConfig.defaultRatePerKm || 10);
            } else {
                // Base fare
                baseShippingCost = cityPricing.baseFare || 0;

                // Add distance charge
                baseShippingCost += params.distanceInKm * (cityPricing.baseRatePerKm || cityPricing.distanceCharge || 0);

                // Add time charge if estimated time is available
                if (params.estimatedTimeInMinutes && cityPricing.timeCharge) {
                    baseShippingCost += params.estimatedTimeInMinutes * cityPricing.timeCharge;
                }

                // Time factor (peak hours might cost more) - only apply if it exists in config
                const currentHour = new Date().getHours();
                const isPeakHour = currentHour >= 17 && currentHour <= 19;
                const timeFactor = isPeakHour && cityPricing.peakHourMultiplier
                    ? cityPricing.peakHourMultiplier
                    : 1;

                baseShippingCost *= timeFactor;

                // Apply minimum fare if applicable
                if (cityPricing.minimumFare && baseShippingCost < cityPricing.minimumFare) {
                    baseShippingCost = cityPricing.minimumFare;
                }

                // Apply Volume and Weight Factor (VWF) for in-city deliveries
                // This ensures the weight/volume is factored into the price
                baseShippingCost *= effectiveWeight;

                // Vehicle type multiplier - only apply if it exists in config
                if (params.vehicleType) {
                    // Normalize vehicle type to match the case in the config (first letter uppercase)
                    const normalizedVehicleType = params.vehicleType.charAt(0).toUpperCase() +
                        params.vehicleType.slice(1).toLowerCase();

                    const vehicleTypes = pricingConfig.vehicleTypes?.[normalizedOriginCity];
                    vehicleTypeMultiplier = vehicleTypes?.[normalizedVehicleType] || 1;
                    baseShippingCost *= vehicleTypeMultiplier;
                }
            }

            // Get additional fees for the city - only if they exist in config
            if (pricingConfig.additionalFees?.[normalizedOriginCity]) {
                additionalFees = pricingConfig.additionalFees[normalizedOriginCity].map(fee => ({
                    name: fee.name,
                    amount: fee.amount
                }));
            }
        } else {
            // Between cities pricing based on origin and destination
            const pricingMatrix = pricingConfig.pricingMatrix || {};

            // Check if we have pricing for the normalized origin city
            const originPricing = pricingMatrix[normalizedOriginCity];

            // Look for the unit rate using the normalized destination city
            const unitRate = originPricing?.[normalizedDestinationCity];

            if (!unitRate) {
                console.warn(
                    `No pricing found for route from ${normalizedOriginCity} to ${normalizedDestinationCity}, using default`
                );
                // Use default pricing if specific route pricing not found
                baseShippingCost = params.distanceInKm * (pricingConfig.defaultRatePerKm || 15);
            } else {
                // Calculate base shipping cost based on effective weight and unit rate
                baseShippingCost = effectiveWeight * unitRate;

                // Apply minimum charge if applicable
                if (pricingConfig.minimumCharge && baseShippingCost < pricingConfig.minimumCharge) {
                    baseShippingCost = pricingConfig.minimumCharge;
                }
            }

            // Get additional fees for the origin city - only if they exist in config
            if (pricingConfig.additionalFees?.[normalizedOriginCity]) {
                additionalFees = pricingConfig.additionalFees[normalizedOriginCity].map(fee => ({
                    name: fee.name,
                    amount: fee.amount
                }));
            }
        }

        // Apply all multipliers to the base shipping cost
        const multipliedShippingCost =
            baseShippingCost *
            customerTypeMultiplier *
            subscriptionTypeMultiplier *
            orderTypeMultiplier *
            goodsTypeMultiplier *
            premiumTypeMultiplier *
            vehicleTypeMultiplier;

        // Calculate total additional fees
        const totalAdditionalFees = additionalFees.reduce(
            (sum, fee) => sum + fee.amount,
            0
        );

        // Calculate total cost
        const totalCost = multipliedShippingCost + packagingCost + totalAdditionalFees;

        // Return price breakdown
        return {
            baseShippingCost,
            effectiveWeight,
            customerTypeMultiplier,
            subscriptionTypeMultiplier,
            orderTypeMultiplier,
            goodsTypeMultiplier,
            premiumTypeMultiplier,
            vehicleTypeMultiplier,
            multipliedShippingCost,
            packagingCost,
            additionalFees,
            totalAdditionalFees,
            totalCost,
        };
    } catch (error) {
        console.error("Error calculating price:", error);
        throw error;
    }
}

/**
 * Format a price as a string with 2 decimal places
 */
export function formatPrice(price: number): string {
    return price.toFixed(2);
} 