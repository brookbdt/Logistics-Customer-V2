<script lang="ts">
  import { enhance } from "$app/forms";
  import { page } from "$app/stores";
  import { toast } from "@zerodevx/svelte-toast";
  import type { PackageType } from "@prisma/client";
  import PackageTypeComponent from "./package-type.svelte";
  import ReceiverInfo from "./receiver-info.svelte";
  import SenderInfo from "./sender-info.svelte";
  import { goto } from "$app/navigation";
  import { fade, fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import type { PageData } from "./$types";
  import {
    calculatePrice as calculatePriceUtil,
    formatPrice,
    type PriceBreakdown,
    type PricingParams,
    extractCityFromAddress as extractCityUtil,
    normalizeCity,
  } from "$lib/utils/pricing";
  export let form;
  export let data: PageData;

  $: console.log({ data });

  let componentsOrder = 1;
  let pickupLat: number | null = null;
  let pickupLng: number | null = null;
  let senderInfo: {
    userName: string;
    phoneNumber: string;
    pickUpTime: string | null;
    pickUpLocation: string;
    mapLocation: string;
    serviceCity?: string;
    city?: string;
  } = {
    userName: $page.data.session?.userData.userName || "",
    phoneNumber: $page.data.session?.userData.phoneNumber || "",
    pickUpTime: null,
    pickUpLocation: $page.data.session?.customerData.physicalAddress || "",
    mapLocation: $page.data.session?.customerData.mapAddress || "",
  };

  let receiversInfo: {
    id: Number;
    userName: string;
    phoneNumber: string;
    dropOffTime: string;
    dropOffLocation: string;
    dropOffMapLocation: string;
    inCity: string;
    receiverEmail: string;
    distanceInKm?: number;
    estimatedTimeInMinutes?: number;
    originCity?: string;
    destinationCity?: string;
  };

  let packageTemp: PackageType;
  let isSubmitting = false;
  let estimatedPrice: string | null = null;
  let priceBreakdown: PriceBreakdown | null = null;

  // Payment option that will be sent with form
  let paymentOption: "pay_now" | "pay_on_acceptance" | "pay_on_delivery" =
    "pay_on_acceptance";

  $: console.log({ receiversInfo });
  $: console.log({ senderInfo });
  $: console.log({ orderType });
  $: console.log({ goodsType });
  $: console.log("priceBreakdown", priceBreakdown);

  $: console.log({ actualWeight });
  $: console.log({ vehicleType });
  $: console.log({ packagingType });

  // Order options
  let orderType: "STANDARD" | "EXPRESS" | "SAME_DAY" = "STANDARD";
  let goodsType: "NORMAL" | "SPECIAL_CARE" = "NORMAL";
  let packagingType: "STANDARD_BOX" | "PREMIUM_BOX" | "SPECIALTY" | "CUSTOM" =
    "STANDARD_BOX";
  let vehicleType: "BIKE" | "CAR" | "TRUCK" = "CAR";
  let actualWeight = 0.5; // Default weight in kg
  let length: number | null = null;
  let width: number | null = null;
  let height: number | null = null;

  // Set default packaging type and vehicle type based on available options
  $: {
    // Set default packaging type to first available option
    const availablePackaging = getAvailablePackagingOptions();
    if (
      availablePackaging.length > 0 &&
      !availablePackaging.includes(packagingType)
    ) {
      packagingType = availablePackaging[0];
    }

    // Set default vehicle type to first available option
    const availableVehicles = getAvailableVehicleTypes();
    if (
      availableVehicles.length > 0 &&
      !availableVehicles.includes(vehicleType)
    ) {
      vehicleType = availableVehicles[0];
    }
  }

  // Computed properties
  $: dimensionalWeight =
    length && width && height ? (length * width * height) / 5000 : 0;
  $: effectiveWeight = Math.max(actualWeight || 0, dimensionalWeight || 0);

  // Helper function to get available packaging options from pricing config
  function getAvailablePackagingOptions() {
    const packagingFees = data?.pricingConfig?.packagingFees || {};
    return Object.keys(packagingFees) as Array<
      "STANDARD_BOX" | "PREMIUM_BOX" | "SPECIALTY" | "CUSTOM"
    >;
  }

  // Helper function to get available vehicle types for the current city
  function getAvailableVehicleTypes() {
    try {
      const city =
        extractCityFromAddress(senderInfo.pickUpLocation) || "Addis Ababa";
      const vehicleTypes =
        data?.pricingConfig?.vehicleTypes?.[
          city as keyof typeof data.pricingConfig.vehicleTypes
        ] || {};
      // Filter and normalize vehicle types to match our expected types
      return Object.keys(vehicleTypes)
        .map((type) => {
          const upperType = type.toUpperCase();
          // Only return types that match our expected vehicle types
          if (["BIKE", "CAR", "TRUCK"].includes(upperType)) {
            return upperType as "BIKE" | "CAR" | "TRUCK";
          }
          return null;
        })
        .filter((type): type is "BIKE" | "CAR" | "TRUCK" => type !== null);
    } catch (error) {
      console.error("Error getting available vehicle types:", error);
      return ["CAR"] as Array<"BIKE" | "CAR" | "TRUCK">; // Default if we can't determine available types
    }
  }

  // Calculate estimated price based on form data
  function calculateEstimatedPrice() {
    if (!receiversInfo?.inCity || !packageTemp) {
      return "0.00";
    }

    try {
      console.log("Calculating estimated price in +page.svelte");
      console.log("Receiver info:", receiversInfo);
      console.log("Package type:", packageTemp);
      console.log("Order type:", orderType);
      console.log("Goods type:", goodsType);
      console.log("Packaging type:", packagingType);
      console.log("Vehicle type:", vehicleType);
      console.log("Weight info:", { actualWeight, dimensionalWeight });

      // Get pricing config with proper type checking
      const pricingConfig = data?.pricingConfig || {};

      // Get customer type with fallback
      const customerType =
        (data as any)?.session?.customerData?.customerType || "INDIVIDUAL";

      console.log(
        "Customer type from session:",
        (data as any)?.session?.customerData?.customerType
      );
      console.log("Using customer type:", customerType);

      // Check if customer has premium status
      const isPremium = !!(data as any)?.session?.customerData?.premium;
      console.log("Premium status:", isPremium);

      // Determine delivery type
      const deliveryType =
        receiversInfo.inCity === "0" ? "IN_CITY" : "BETWEEN_CITIES";

      // Extract city information using the shared utility
      const originCity = normalizeCity(
        receiversInfo.originCity ||
          extractCityFromAddress(senderInfo.pickUpLocation) ||
          "Addis Ababa",
        pricingConfig.cities
      );

      const destinationCity = normalizeCity(
        receiversInfo.destinationCity ||
          extractCityFromAddress(receiversInfo.dropOffLocation) ||
          "Addis Ababa",
        pricingConfig.cities
      );

      console.log("Normalized cities:", { originCity, destinationCity });
      console.log("Distance:", receiversInfo.distanceInKm);
      console.log("Time:", receiversInfo.estimatedTimeInMinutes);

      // Prepare pricing parameters
      const pricingParams: PricingParams = {
        deliveryType,
        originCity,
        destinationCity,
        distanceInKm: receiversInfo.distanceInKm || 0,
        estimatedTimeInMinutes: receiversInfo.estimatedTimeInMinutes || 0,
        customerType,
        hasSubscription: !!data?.session,
        isPremium,
        orderType,
        goodsType,
        packagingType,
        actualWeight: actualWeight || 0,
        dimensionalWeight: dimensionalWeight || 0,
        vehicleType,
      };

      console.log("Pricing parameters:", pricingParams);

      // Calculate price using the utility function
      const result = calculatePriceUtil(pricingParams, pricingConfig);

      console.log("Price calculation result:", result);

      // Store price breakdown for display
      priceBreakdown = result;

      return formatPrice(result.totalCost);
    } catch (error) {
      console.error("Error calculating price:", error);
      return "0.00";
    }
  }

  // Recalculate price whenever any relevant factor changes
  $: if (receiversInfo?.inCity && packageTemp) {
    estimatedPrice = calculateEstimatedPrice();
  }

  // Also recalculate when these factors change
  $: if (
    orderType ||
    goodsType ||
    packagingType ||
    vehicleType ||
    actualWeight ||
    dimensionalWeight
  ) {
    if (receiversInfo?.inCity && packageTemp) {
      estimatedPrice = calculateEstimatedPrice();
    }
  }

  $: form?.newOrder ? toast.push("Order Created Successfully!") : null;

  $: form?.newOrder ? goto("/") : null;

  // Progress percentage calculation
  $: progressPercentage = ((componentsOrder - 1) / 3) * 100;

  // Helper function to extract city from address
  function extractCityFromAddress(address: string): string | null {
    return extractCityUtil(address, data?.pricingConfig?.cities, "Addis Ababa");
  }

  // Helper function to get vehicle multiplier safely
  function getVehicleMultiplier(): number {
    try {
      const city =
        extractCityFromAddress(senderInfo.pickUpLocation) || "Addis Ababa";
      // Normalize vehicle type to match the case in the config (first letter uppercase)
      const normalizedVehicleType =
        vehicleType.charAt(0).toUpperCase() +
        vehicleType.slice(1).toLowerCase();

      const cityVehicleTypes =
        data?.pricingConfig?.vehicleTypes?.[
          city as keyof typeof data.pricingConfig.vehicleTypes
        ];
      if (cityVehicleTypes && normalizedVehicleType in cityVehicleTypes) {
        return (cityVehicleTypes as Record<string, number>)[
          normalizedVehicleType
        ];
      }
    } catch (error) {
      console.error("Error getting vehicle multiplier:", error);
    }
    return 1.0; // Default multiplier if not found in config
  }

  // Helper function to get peak hour multiplier safely
  function getPeakHourMultiplier(): number {
    try {
      const city =
        extractCityFromAddress(senderInfo.pickUpLocation) || "Addis Ababa";

      const cityPricing =
        data?.pricingConfig?.inCityPricing?.[
          city as keyof typeof data.pricingConfig.inCityPricing
        ];
      if (cityPricing && "peakHourMultiplier" in cityPricing) {
        return (cityPricing as { peakHourMultiplier: number })
          .peakHourMultiplier;
      }
    } catch (error) {
      console.error("Error getting peak hour multiplier:", error);
    }
    return 1.2; // Default peak hour multiplier if not found in config
  }

  // Helper function to get customer type
  function getCustomerType(): string {
    const customerType =
      (data as any)?.session?.customerData?.customerType || "individual";
    return customerType.toLowerCase();
  }

  // Helper function to check if it's peak hour
  function isPeakHour(): boolean {
    const currentHour = new Date().getHours();
    return currentHour >= 17 && currentHour <= 19;
  }

  // Helper function to check if there's a peak hour multiplier in the config
  function hasPeakHourMultiplier(): boolean {
    try {
      const city =
        extractCityFromAddress(senderInfo.pickUpLocation) || "Addis Ababa";

      const cityPricing =
        data?.pricingConfig?.inCityPricing?.[
          city as keyof typeof data.pricingConfig.inCityPricing
        ];
      return !!cityPricing && "peakHourMultiplier" in cityPricing;
    } catch (error) {
      return false;
    }
  }
</script>

<div class="max-w-3xl mx-auto px-4 py-8">
  <div class="mb-8 text-center">
    <h1 class="text-3xl font-bold text-gray-800 mb-2">Create Your Shipment</h1>
    <p class="text-gray-600 max-w-lg mx-auto">
      We'll handle your package with care and deliver it safely to its
      destination.
    </p>
  </div>

  <!-- Progress bar -->
  <div class="mb-12">
    <div class="relative">
      <div
        class="overflow-hidden h-2 mb-6 text-xs flex rounded-full bg-gray-200"
      >
        <div
          style="width:{progressPercentage}%"
          class="transition-all duration-500 shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-secondary"
        ></div>
      </div>

      <div class="flex justify-between">
        <div class="flex flex-col items-center">
          <button
            on:click={() => (componentsOrder = 1)}
            class="{componentsOrder >= 1
              ? 'bg-secondary text-white'
              : 'bg-gray-200 text-gray-500'} rounded-full h-10 w-10 flex justify-center items-center transition-all duration-300 shadow-md hover:shadow-lg"
          >
            1
          </button>
          <span
            class="text-xs mt-2 font-medium {componentsOrder >= 1
              ? 'text-secondary'
              : 'text-gray-500'}"
          >
            Sender
          </span>
        </div>

        <div class="flex flex-col items-center">
          <button
            on:click={() =>
              componentsOrder >= 2 ? (componentsOrder = 2) : null}
            class="{componentsOrder >= 2
              ? 'bg-secondary text-white'
              : 'bg-gray-200 text-gray-500'} rounded-full h-10 w-10 flex justify-center items-center transition-all duration-300 shadow-md hover:shadow-lg"
          >
            2
          </button>
          <span
            class="text-xs mt-2 font-medium {componentsOrder >= 2
              ? 'text-secondary'
              : 'text-gray-500'}"
          >
            Receiver
          </span>
        </div>

        <div class="flex flex-col items-center">
          <button
            on:click={() =>
              componentsOrder >= 3 ? (componentsOrder = 3) : null}
            class="{componentsOrder >= 3
              ? 'bg-secondary text-white'
              : 'bg-gray-200 text-gray-500'} rounded-full h-10 w-10 flex justify-center items-center transition-all duration-300 shadow-md hover:shadow-lg"
          >
            3
          </button>
          <span
            class="text-xs mt-2 font-medium {componentsOrder >= 3
              ? 'text-secondary'
              : 'text-gray-500'}"
          >
            Package
          </span>
        </div>

        <div class="flex flex-col items-center">
          <div
            class="{componentsOrder >= 4
              ? 'bg-secondary text-white'
              : 'bg-gray-200 text-gray-500'} rounded-full h-10 w-10 flex justify-center items-center transition-all duration-300"
          >
            ✓
          </div>
          <span
            class="text-xs mt-2 font-medium {componentsOrder >= 4
              ? 'text-secondary'
              : 'text-gray-500'}"
          >
            Complete
          </span>
        </div>
      </div>
    </div>
  </div>

  <!-- Form container with card styling -->
  <div
    class="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100"
  >
    <div class="p-6">
      <form
        method="post"
        action="?/createOrder"
        use:enhance={({ formData, formElement, cancel }) => {
          isSubmitting = true;
          console.log("senderInfo", senderInfo);
          console.log("receiversInfo", receiversInfo);

          // Check if all required fields have been filled out
          // The issue is that we're trying to access form elements by name, but they might not exist
          // Let's check if they exist first and then check their values
          const requiredFields = [
            "phoneNumber",
            "pickUpTime",
            "pickUpLocation",
            "mapAddress",
            "receiverUsername",
            "receiverPhoneNumber",
            "inCity",
            "dropOffTime",
            "dropOffLocation",
            "dropOffMapAddress",
          ];

          let missingFields = false;

          // Check each field exists and has a value
          for (const field of requiredFields) {
            const element = formElement.elements.namedItem(field);
            if (!element) {
              console.log(`Missing field: ${field}`);
              missingFields = true;
              break;
            }

            // Check if the element has a value property and it's empty
            // @ts-ignore - Ignore TypeScript error for value property
            if (element.value === undefined || element.value === "") {
              console.log(`Empty field: ${field}`);
              missingFields = true;
              break;
            }
          }

          if (missingFields) {
            toast.push("Please fill out all required fields");
            isSubmitting = false;
            cancel();
            return;
          }

          // Add the receiver ID to the form data if we have a customer
          if (receiversInfo && receiversInfo.id) {
            formData.set("receiverId", receiversInfo.id.toString());
          }

          return ({ result }) => {
            isSubmitting = false;
            if (result.type === "failure") {
              toast.push(result.data?.errorMessage || "An error occurred");
            } else if (result.type === "success") {
              toast.push(
                "Order created successfully! Your delivery is on its way."
              );

              // Redirect based on payment option
              if (paymentOption === "pay_now" && result.data?.orderId) {
                // Redirect to payment page for immediate payment
                setTimeout(() => {
                  goto(`/finalize-order/${result.data?.orderId}`);
                }, 1000);
              } else {
                // Redirect to orders page for other payment options
                setTimeout(() => {
                  goto("/orders");
                }, 1500);
              }
            }
          };
        }}
      >
        <!-- Hidden fields for sender info -->
        <input type="hidden" name="userName" bind:value={senderInfo.userName} />
        {#if receiversInfo && receiversInfo.originCity && receiversInfo.destinationCity}
          <input
            type="hidden"
            name="originCity"
            bind:value={receiversInfo.originCity}
          />
        {/if}
        {#if receiversInfo && receiversInfo.destinationCity}
          <input
            type="hidden"
            name="destinationCity"
            bind:value={receiversInfo.destinationCity}
          />
        {/if}
        <input
          type="hidden"
          name="phoneNumber"
          bind:value={senderInfo.phoneNumber}
        />
        <input
          type="hidden"
          name="pickUpTime"
          value={senderInfo.pickUpTime || ""}
        />
        <input
          type="hidden"
          name="pickUpLocation"
          bind:value={senderInfo.pickUpLocation}
        />
        <input type="hidden" name="mapAddress" value={senderInfo.mapLocation} />

        <!-- Hidden fields for receiver info -->
        {#if receiversInfo}
          <input
            type="hidden"
            name="receiverUsername"
            bind:value={receiversInfo.userName}
          />
          <input
            type="hidden"
            name="receiverPhoneNumber"
            bind:value={receiversInfo.phoneNumber}
          />
          <input
            type="hidden"
            name="receiverEmail"
            bind:value={receiversInfo.receiverEmail}
          />
          <input type="hidden" name="inCity" value={receiversInfo.inCity} />
          <input
            type="hidden"
            name="dropOffTime"
            bind:value={receiversInfo.dropOffTime}
          />
          <input
            type="hidden"
            name="dropOffLocation"
            bind:value={receiversInfo.dropOffLocation}
          />
          <input
            type="hidden"
            name="dropOffMapAddress"
            bind:value={receiversInfo.dropOffMapLocation}
          />
        {/if}

        <!-- Hidden field for package type -->
        {#if packageTemp}
          <input type="hidden" name="packageType" bind:value={packageTemp} />
        {/if}

        <!-- Hidden fields for order options -->
        <input type="hidden" name="orderType" bind:value={orderType} />
        <input type="hidden" name="goodsType" bind:value={goodsType} />
        <input type="hidden" name="packagingType" bind:value={packagingType} />
        <input type="hidden" name="vehicleType" bind:value={vehicleType} />
        <input type="hidden" name="actualWeight" bind:value={actualWeight} />

        {#if componentsOrder === 1}
          <div in:fade={{ duration: 300 }}>
            <SenderInfo
              bind:senderInfo
              {data}
              on:back={() => {
                if (componentsOrder > 1) {
                  componentsOrder -= 1;
                }
              }}
              on:next={(event) => {
                // Store the coordinates from the sender component
                if (event.detail && event.detail.coordinates) {
                  pickupLat = event.detail.coordinates.lat;
                  pickupLng = event.detail.coordinates.lng;
                  console.log(
                    "Pickup coordinates stored:",
                    pickupLat,
                    pickupLng
                  );
                }

                // Pass city information from sender to receiver info
                if (event.detail && event.detail.senderInfo) {
                  // Initialize receiversInfo if it doesn't exist yet
                  if (!receiversInfo) {
                    receiversInfo = {
                      id: 0,
                      userName: "",
                      phoneNumber: "",
                      dropOffTime: "",
                      dropOffLocation: "",
                      dropOffMapLocation: "",
                      inCity: "",
                      receiverEmail: "",
                    };
                  }

                  // Use serviceCity (normalized city name) if available, otherwise use city
                  const cityFromSender =
                    event.detail.senderInfo.serviceCity ||
                    event.detail.senderInfo.city;

                  if (cityFromSender) {
                    console.log(
                      "Setting originCity from sender:",
                      cityFromSender
                    );
                    receiversInfo.originCity = cityFromSender;
                  }
                }

                if (componentsOrder >= 1) {
                  componentsOrder += 1;
                }
              }}
            />
          </div>
        {/if}

        {#if componentsOrder === 2}
          <div in:fade={{ duration: 300 }}>
            <ReceiverInfo
              bind:form
              bind:receiversInfo
              {data}
              lat1={pickupLat}
              lng1={pickupLng}
              on:back={() => {
                if (componentsOrder > 1) {
                  componentsOrder -= 1;
                }
              }}
              on:next={(event) => {
                // Store all pricing-related data if available
                if (event.detail) {
                  console.log(
                    "Received data from receiver-info component:",
                    event.detail
                  );

                  // Store distance and time information
                  if (event.detail.distanceInKm !== undefined) {
                    receiversInfo.distanceInKm = event.detail.distanceInKm;
                  }

                  if (event.detail.estimatedTimeInMinutes !== undefined) {
                    receiversInfo.estimatedTimeInMinutes =
                      event.detail.estimatedTimeInMinutes;
                  }

                  // Store city information to ensure consistency
                  if (event.detail.originCity) {
                    receiversInfo.originCity = event.detail.originCity;
                  }

                  if (event.detail.destinationCity) {
                    receiversInfo.destinationCity =
                      event.detail.destinationCity;
                  }

                  // Store pre-calculated price if available
                  if (event.detail.calculatedPrice) {
                    // Use this as an initial price before recalculating with current options
                    const initialPrice = event.detail.calculatedPrice;
                    console.log(
                      "Initial price from receiver component:",
                      initialPrice
                    );
                  }

                  // Store coordinates information
                  if (event.detail.coordinates) {
                    console.log(
                      "Received coordinates:",
                      event.detail.coordinates
                    );
                  }

                  // Recalculate price with all the current information
                  if (receiversInfo?.inCity && packageTemp) {
                    estimatedPrice = calculateEstimatedPrice();
                  }
                }

                if (componentsOrder >= 1) {
                  componentsOrder += 1;
                }
              }}
            />
          </div>
        {/if}

        {#if componentsOrder === 3}
          <div in:fade={{ duration: 300 }}>
            <PackageTypeComponent bind:packageType={packageTemp} />

            <!-- Enhanced Order Options -->
            <div
              class="mt-8 bg-gray-50 p-4 sm:p-6 rounded-lg border border-gray-200"
            >
              <h3 class="text-lg font-semibold text-gray-800 mb-4">
                Customize Your Delivery
              </h3>

              <!-- Order Type Selection -->
              <div class="mb-5">
                <label class="block text-sm font-medium text-gray-700 mb-2"
                  >Delivery Speed</label
                >
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                  <button
                    type="button"
                    class="flex items-center p-3 sm:p-4 border rounded-lg transition-all {orderType ===
                    'STANDARD'
                      ? 'bg-secondary/10 border-secondary text-secondary'
                      : 'border-gray-200 hover:bg-gray-100'}"
                    on:click={() => (orderType = "STANDARD")}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-5 w-5 sm:h-6 sm:w-6 mr-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div>
                      <span class="text-sm font-medium">Standard</span>
                      <span class="text-xs text-gray-500 block sm:mt-1"
                        >Regular delivery</span
                      >
                    </div>
                  </button>

                  <button
                    type="button"
                    class="flex items-center p-3 sm:p-4 border rounded-lg transition-all {orderType ===
                    'EXPRESS'
                      ? 'bg-secondary/10 border-secondary text-secondary'
                      : 'border-gray-200 hover:bg-gray-100'}"
                    on:click={() => (orderType = "EXPRESS")}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-5 w-5 sm:h-6 sm:w-6 mr-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    <div>
                      <span class="text-sm font-medium">Express</span>
                      <span class="text-xs text-gray-500 block sm:mt-1"
                        >Priority shipping</span
                      >
                    </div>
                  </button>

                  <button
                    type="button"
                    class="flex items-center p-3 sm:p-4 border rounded-lg transition-all {orderType ===
                    'SAME_DAY'
                      ? 'bg-secondary/10 border-secondary text-secondary'
                      : 'border-gray-200 hover:bg-gray-100'}"
                    on:click={() => (orderType = "SAME_DAY")}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-5 w-5 sm:h-6 sm:w-6 mr-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    <div>
                      <span class="text-sm font-medium">Same Day</span>
                      <span class="text-xs text-gray-500 block sm:mt-1"
                        >Delivered today</span
                      >
                    </div>
                  </button>
                </div>
              </div>

              <!-- Goods Type Selection -->
              <div class="mb-5">
                <label class="block text-sm font-medium text-gray-700 mb-2"
                  >Package Contents</label
                >
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <button
                    type="button"
                    class="flex items-center p-3 sm:p-4 border rounded-lg transition-all {goodsType ===
                    'NORMAL'
                      ? 'bg-secondary/10 border-secondary text-secondary'
                      : 'border-gray-200 hover:bg-gray-100'}"
                    on:click={() => (goodsType = "NORMAL")}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-5 w-5 sm:h-6 sm:w-6 mr-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                      />
                    </svg>
                    <div>
                      <span class="text-sm font-medium block">Normal Items</span
                      >
                      <span class="text-xs text-gray-500"
                        >Standard handling</span
                      >
                    </div>
                  </button>

                  <button
                    type="button"
                    class="flex items-center p-3 sm:p-4 border rounded-lg transition-all {goodsType ===
                    'SPECIAL_CARE'
                      ? 'bg-secondary/10 border-secondary text-secondary'
                      : 'border-gray-200 hover:bg-gray-100'}"
                    on:click={() => (goodsType = "SPECIAL_CARE")}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-5 w-5 sm:h-6 sm:w-6 mr-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    <div>
                      <span class="text-sm font-medium block">Special Care</span
                      >
                      <span class="text-xs text-gray-500"
                        >Fragile/sensitive items</span
                      >
                    </div>
                  </button>
                </div>
              </div>

              <!-- Packaging Selection -->
              <div class="mb-5">
                <label class="block text-sm font-medium text-gray-700 mb-2"
                  >Packaging Options</label
                >
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  {#if getAvailablePackagingOptions().includes("STANDARD_BOX")}
                    <button
                      type="button"
                      class="flex items-center p-3 sm:p-4 border rounded-lg transition-all {packagingType ===
                      'STANDARD_BOX'
                        ? 'bg-secondary/10 border-secondary text-secondary'
                        : 'border-gray-200 hover:bg-gray-100'}"
                      on:click={() => (packagingType = "STANDARD_BOX")}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5 sm:h-6 sm:w-6 mr-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"
                        />
                      </svg>
                      <div>
                        <span class="text-sm font-medium block"
                          >Standard Box</span
                        >
                        <span class="text-xs text-gray-500"
                          >Basic packaging</span
                        >
                      </div>
                    </button>
                  {/if}

                  {#if getAvailablePackagingOptions().includes("PREMIUM_BOX")}
                    <button
                      type="button"
                      class="flex items-center p-3 sm:p-4 border rounded-lg transition-all {packagingType ===
                      'PREMIUM_BOX'
                        ? 'bg-secondary/10 border-secondary text-secondary'
                        : 'border-gray-200 hover:bg-gray-100'}"
                      on:click={() => (packagingType = "PREMIUM_BOX")}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5 sm:h-6 sm:w-6 mr-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                        />
                      </svg>
                      <div>
                        <span class="text-sm font-medium block"
                          >Premium Box</span
                        >
                        <span class="text-xs text-gray-500"
                          >Enhanced protection</span
                        >
                      </div>
                    </button>
                  {/if}

                  {#if getAvailablePackagingOptions().includes("SPECIALTY")}
                    <button
                      type="button"
                      class="flex items-center p-3 sm:p-4 border rounded-lg transition-all {packagingType ===
                      'SPECIALTY'
                        ? 'bg-secondary/10 border-secondary text-secondary'
                        : 'border-gray-200 hover:bg-gray-100'}"
                      on:click={() => (packagingType = "SPECIALTY")}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5 sm:h-6 sm:w-6 mr-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                        />
                      </svg>
                      <div>
                        <span class="text-sm font-medium block">Specialty</span>
                        <span class="text-xs text-gray-500"
                          >Special handling</span
                        >
                      </div>
                    </button>
                  {/if}

                  {#if getAvailablePackagingOptions().includes("CUSTOM")}
                    <button
                      type="button"
                      class="flex items-center p-3 sm:p-4 border rounded-lg transition-all {packagingType ===
                      'CUSTOM'
                        ? 'bg-secondary/10 border-secondary text-secondary'
                        : 'border-gray-200 hover:bg-gray-100'}"
                      on:click={() => (packagingType = "CUSTOM")}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5 sm:h-6 sm:w-6 mr-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                      <div>
                        <span class="text-sm font-medium block">Custom</span>
                        <span class="text-xs text-gray-500"
                          >Tailored packaging</span
                        >
                      </div>
                    </button>
                  {/if}
                </div>
                {#if getAvailablePackagingOptions().length === 0}
                  <p class="text-sm text-gray-500 mt-2">
                    No packaging options available for this location.
                  </p>
                {/if}
              </div>

              <!-- Vehicle Type Selection (only for in-city deliveries) -->
              {#if receiversInfo?.inCity === "0"}
                <div class="mb-5">
                  <label class="block text-sm font-medium text-gray-700 mb-2"
                    >Vehicle Type</label
                  >
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                    {#if getAvailableVehicleTypes().includes("BIKE")}
                      <button
                        type="button"
                        class="flex items-center p-3 sm:p-4 border rounded-lg transition-all {vehicleType ===
                        'BIKE'
                          ? 'bg-secondary/10 border-secondary text-secondary'
                          : 'border-gray-200 hover:bg-gray-100'}"
                        on:click={() => (vehicleType = "BIKE")}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-5 w-5 sm:h-6 sm:w-6 mr-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M5 12a2 2 0 012-2h10a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2v-6z"
                          />
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"
                          />
                        </svg>
                        <div>
                          <span class="text-sm font-medium block">Bike</span>
                          <span class="text-xs text-gray-500"
                            >Small packages</span
                          >
                        </div>
                      </button>
                    {/if}

                    {#if getAvailableVehicleTypes().includes("CAR")}
                      <button
                        type="button"
                        class="flex items-center p-3 sm:p-4 border rounded-lg transition-all {vehicleType ===
                        'CAR'
                          ? 'bg-secondary/10 border-secondary text-secondary'
                          : 'border-gray-200 hover:bg-gray-100'}"
                        on:click={() => (vehicleType = "CAR")}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-5 w-5 sm:h-6 sm:w-6 mr-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                          />
                        </svg>
                        <div>
                          <span class="text-sm font-medium block">Car</span>
                          <span class="text-xs text-gray-500"
                            >Medium packages</span
                          >
                        </div>
                      </button>
                    {/if}

                    {#if getAvailableVehicleTypes().includes("TRUCK")}
                      <button
                        type="button"
                        class="flex items-center p-3 sm:p-4 border rounded-lg transition-all {vehicleType ===
                        'TRUCK'
                          ? 'bg-secondary/10 border-secondary text-secondary'
                          : 'border-gray-200 hover:bg-gray-100'}"
                        on:click={() => (vehicleType = "TRUCK")}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-5 w-5 sm:h-6 sm:w-6 mr-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                          />
                        </svg>
                        <div>
                          <span class="text-sm font-medium block">Truck</span>
                          <span class="text-xs text-gray-500"
                            >Large packages</span
                          >
                        </div>
                      </button>
                    {/if}
                  </div>
                  {#if getAvailableVehicleTypes().length === 0}
                    <p class="text-sm text-gray-500 mt-2">
                      No vehicle types available for this location.
                    </p>
                  {/if}
                  <p class="text-xs text-gray-500 mt-2">
                    Vehicle type affects pricing for in-city deliveries
                  </p>
                </div>
              {/if}

              <!-- Package Dimensions -->
              <div class="mb-5">
                <label class="block text-sm font-medium text-gray-700 mb-2"
                  >Package Dimensions & Weight</label
                >
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  <div>
                    <label class="block text-xs text-gray-500 mb-1"
                      >Length (cm)</label
                    >
                    <input
                      type="number"
                      bind:value={length}
                      min="0"
                      class="w-full p-2 border border-gray-300 rounded-md text-sm"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label class="block text-xs text-gray-500 mb-1"
                      >Width (cm)</label
                    >
                    <input
                      type="number"
                      bind:value={width}
                      min="0"
                      class="w-full p-2 border border-gray-300 rounded-md text-sm"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label class="block text-xs text-gray-500 mb-1"
                      >Height (cm)</label
                    >
                    <input
                      type="number"
                      bind:value={height}
                      min="0"
                      class="w-full p-2 border border-gray-300 rounded-md text-sm"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label class="block text-xs text-gray-500 mb-1"
                      >Weight (kg)</label
                    >
                    <input
                      type="number"
                      bind:value={actualWeight}
                      min="0.1"
                      step="0.1"
                      class="w-full p-2 border border-gray-300 rounded-md text-sm"
                      placeholder="0.5"
                    />
                  </div>
                </div>
                {#if dimensionalWeight > 0}
                  <div class="mt-2 text-xs text-gray-600">
                    <span
                      >Dimensional weight: <span class="font-medium"
                        >{dimensionalWeight.toFixed(2)} kg</span
                      ></span
                    >
                    {#if dimensionalWeight > actualWeight}
                      <span class="ml-2 text-secondary"
                        >(This will be used for pricing)</span
                      >
                    {/if}
                  </div>
                {/if}
              </div>
            </div>

            <!-- Order Summary -->
            {#if packageTemp}
              <div
                class="mt-8 bg-white p-6 rounded-lg border border-gray-200 shadow-md"
                in:fly={{ y: 20, duration: 400, easing: cubicOut }}
              >
                <div class="flex items-center justify-between mb-4">
                  <h3 class="text-lg font-semibold text-gray-800">
                    Order Summary
                  </h3>
                  <span
                    class="bg-secondary/10 text-secondary text-xs font-medium px-3 py-1 rounded-full"
                  >
                    {receiversInfo?.inCity === "0"
                      ? "In City"
                      : "Between Cities"}
                  </span>
                </div>

                <div class="space-y-4 mb-6">
                  <div
                    class="flex justify-between items-center pb-3 border-b border-gray-100"
                  >
                    <div class="flex items-center">
                      <div class="bg-gray-100 rounded-full p-2 mr-3">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-4 w-4 text-gray-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                          />
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                      </div>
                      <div>
                        <span class="text-xs text-gray-500">From</span>
                        <span class="block text-sm font-medium text-gray-800"
                          >{senderInfo.userName}</span
                        >
                      </div>
                    </div>
                    <div class="text-right">
                      <span class="text-xs text-gray-500">Location</span>
                      <span
                        class="block text-sm text-gray-800 truncate max-w-[150px]"
                        >{senderInfo.pickUpLocation}</span
                      >
                    </div>
                  </div>

                  <div
                    class="flex justify-between items-center pb-3 border-b border-gray-100"
                  >
                    <div class="flex items-center">
                      <div class="bg-gray-100 rounded-full p-2 mr-3">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-4 w-4 text-gray-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                          />
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                      </div>
                      <div>
                        <span class="text-xs text-gray-500">To</span>
                        <span class="block text-sm font-medium text-gray-800"
                          >{receiversInfo?.userName}</span
                        >
                      </div>
                    </div>
                    <div class="text-right">
                      <span class="text-xs text-gray-500">Location</span>
                      <span
                        class="block text-sm text-gray-800 truncate max-w-[150px]"
                        >{receiversInfo?.dropOffLocation}</span
                      >
                    </div>
                  </div>

                  <div
                    class="grid grid-cols-3 gap-4 pb-3 border-b border-gray-100"
                  >
                    <div>
                      <span class="text-xs text-gray-500">Package Type</span>
                      <span class="block text-sm font-medium text-gray-800"
                        >{packageTemp}</span
                      >
                    </div>
                    <div>
                      <span class="text-xs text-gray-500">Delivery Speed</span>
                      <span class="block text-sm font-medium text-gray-800"
                        >{orderType.replace("_", " ").toLowerCase()}</span
                      >
                    </div>
                    <div>
                      <span class="text-xs text-gray-500">Contents</span>
                      <span class="block text-sm font-medium text-gray-800"
                        >{goodsType.replace("_", " ").toLowerCase()}</span
                      >
                    </div>
                  </div>

                  {#if priceBreakdown}
                    <div class="pt-2">
                      <div class="flex justify-between text-sm mb-2">
                        <span class="text-gray-600">Base shipping cost:</span>
                        <span class="font-medium"
                          >${priceBreakdown.baseShippingCost.toFixed(2)}</span
                        >
                      </div>

                      {#if receiversInfo.inCity !== "0"}
                        <!-- For between-cities deliveries, show the effective weight factor -->
                        <div class="flex justify-between text-sm mb-2">
                          <span class="text-gray-600">
                            Volume and Weight Factor (VWF):
                          </span>
                          <span class="font-medium">
                            {priceBreakdown.effectiveWeight.toFixed(2)} kg
                            {#if dimensionalWeight > actualWeight}
                              <span class="text-xs text-secondary ml-1"
                                >(Dimensional)</span
                              >
                            {:else}
                              <span class="text-xs text-secondary ml-1"
                                >(Actual)</span
                              >
                            {/if}
                          </span>
                        </div>
                      {:else}
                        <!-- For in-city deliveries, show distance and time charges -->
                        <div class="flex justify-between text-sm mb-2">
                          <span class="text-gray-600">
                            Distance ({receiversInfo.distanceInKm?.toFixed(2) ||
                              0} km):
                          </span>
                          <span class="font-medium"> Included </span>
                        </div>

                        {#if receiversInfo.estimatedTimeInMinutes}
                          <div class="flex justify-between text-sm mb-2">
                            <span class="text-gray-600">
                              Estimated time ({receiversInfo.estimatedTimeInMinutes}
                              min):
                            </span>
                            <span class="font-medium"> Included </span>
                          </div>
                        {/if}

                        <!-- Show volume and weight factor for in-city deliveries too -->
                        <div class="flex justify-between text-sm mb-2">
                          <span class="text-gray-600">
                            Volume and Weight Factor (VWF):
                          </span>
                          <span class="font-medium">
                            {priceBreakdown.effectiveWeight.toFixed(2)} kg
                            {#if dimensionalWeight > actualWeight}
                              <span class="text-xs text-secondary ml-1"
                                >(Dimensional)</span
                              >
                            {:else}
                              <span class="text-xs text-secondary ml-1"
                                >(Actual)</span
                              >
                            {/if}
                          </span>
                        </div>

                        <!-- Show vehicle type multiplier for in-city deliveries -->
                        {#if getVehicleMultiplier() !== 1.0}
                          <div class="flex justify-between text-sm mb-2">
                            <span class="text-gray-600">
                              Vehicle type ({vehicleType.toLowerCase()}):
                            </span>
                            <span class="font-medium">
                              × {getVehicleMultiplier().toFixed(2)}
                            </span>
                          </div>
                        {/if}

                        <!-- Show peak hour information if applicable -->
                        {#if isPeakHour() && hasPeakHourMultiplier()}
                          <div class="flex justify-between text-sm mb-2">
                            <span class="text-gray-600">
                              Peak hour surcharge:
                            </span>
                            <span class="font-medium">
                              × {getPeakHourMultiplier().toFixed(2)}
                            </span>
                          </div>
                        {/if}
                      {/if}

                      <!-- Only show customer type multiplier if it's not 1.0 -->
                      {#if priceBreakdown.customerTypeMultiplier !== 1.0}
                        <div class="flex justify-between text-sm mb-2">
                          <span class="text-gray-600">
                            Customer type: {getCustomerType()}
                          </span>
                          <span class="font-medium"
                            >× {priceBreakdown.customerTypeMultiplier.toFixed(
                              2
                            )}</span
                          >
                        </div>
                      {/if}

                      <!-- Only show subscription multiplier if it's not 1.0 -->
                      {#if priceBreakdown.subscriptionTypeMultiplier !== 1.0}
                        <div class="flex justify-between text-sm mb-2">
                          <span class="text-gray-600">
                            Subscription: {data?.session
                              ? "registered"
                              : "unregistered"}
                          </span>
                          <span class="font-medium"
                            >× {priceBreakdown.subscriptionTypeMultiplier.toFixed(
                              2
                            )}</span
                          >
                        </div>
                      {/if}

                      <!-- Only show order type multiplier if it's not 1.0 -->
                      {#if priceBreakdown.orderTypeMultiplier !== 1.0}
                        <div class="flex justify-between text-sm mb-2">
                          <span class="text-gray-600">
                            Order type: {orderType.toLowerCase()}
                          </span>
                          <span class="font-medium"
                            >× {priceBreakdown.orderTypeMultiplier.toFixed(
                              2
                            )}</span
                          >
                        </div>
                      {/if}

                      <!-- Only show goods type multiplier if it's not 1.0 -->
                      {#if priceBreakdown.goodsTypeMultiplier !== 1.0}
                        <div class="flex justify-between text-sm mb-2">
                          <span class="text-gray-600">
                            Goods type: {goodsType
                              .toLowerCase()
                              .replace("_", " ")}
                          </span>
                          <span class="font-medium"
                            >× {priceBreakdown.goodsTypeMultiplier.toFixed(
                              2
                            )}</span
                          >
                        </div>
                      {/if}

                      <!-- Only show premium type multiplier if it's not 1.0 -->
                      {#if priceBreakdown.premiumTypeMultiplier && priceBreakdown.premiumTypeMultiplier !== 1.0}
                        <div class="flex justify-between text-sm mb-2">
                          <span class="text-gray-600"> Premium status </span>
                          <span class="font-medium"
                            >× {priceBreakdown.premiumTypeMultiplier.toFixed(
                              2
                            )}</span
                          >
                        </div>
                      {/if}

                      <div
                        class="flex justify-between text-sm mb-2 font-medium"
                      >
                        <span class="text-gray-700">Shipping subtotal:</span>
                        <span
                          >${priceBreakdown.multipliedShippingCost.toFixed(
                            2
                          )}</span
                        >
                      </div>

                      <!-- Only show packaging cost if it's not 0 -->
                      {#if priceBreakdown.packagingCost > 0}
                        <div class="flex justify-between text-sm mb-2">
                          <span class="text-gray-600"
                            >Packaging ({packagingType
                              .replace("_", " ")
                              .toLowerCase()}):</span
                          >
                          <span class="font-medium"
                            >${priceBreakdown.packagingCost.toFixed(2)}</span
                          >
                        </div>
                      {/if}

                      {#if priceBreakdown.additionalFees.length > 0}
                        {#each priceBreakdown.additionalFees as fee}
                          <div class="flex justify-between text-sm mb-2">
                            <span class="text-gray-600">{fee.name}:</span>
                            <span class="font-medium"
                              >${fee.amount.toFixed(2)}</span
                            >
                          </div>
                        {/each}
                      {/if}

                      <div
                        class="flex justify-between text-sm mb-2 pt-2 border-t border-gray-200 mt-2 font-bold"
                      >
                        <span>Total:</span>
                        <span>${priceBreakdown.totalCost.toFixed(2)}</span>
                      </div>
                    </div>
                  {/if}
                </div>

                <div class="bg-gray-50 p-4 rounded-lg">
                  <div class="flex justify-between items-center">
                    <span class="text-gray-800 font-semibold">Total Price:</span
                    >
                    <div class="text-right">
                      <span class="text-2xl font-bold text-secondary"
                        >${estimatedPrice}</span
                      >
                      <span class="block text-xs text-gray-500 mt-1"
                        >All taxes included</span
                      >
                    </div>
                  </div>

                  <div
                    class="mt-4 text-xs text-gray-600 bg-green-50 border border-green-100 rounded-lg p-3"
                  >
                    <div class="flex">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-4 w-4 text-green-500 mr-2 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                        />
                      </svg>
                      <div>
                        <p class="font-medium text-green-800">
                          Your package is protected
                        </p>
                        <p class="mt-1 text-green-700">
                          All shipments include basic insurance coverage up to
                          $100. Need more? Add extra coverage at checkout.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Premium Experience and Trust Indicators -->
                <div class="mt-6 mb-6">
                  <!-- Elite Service Indicator -->
                  <div
                    class="bg-gradient-to-r from-amber-50 to-amber-100 rounded-lg p-4 mb-5 border border-amber-200 shadow-sm"
                  >
                    <div class="flex items-center">
                      <div
                        class="mr-3 bg-gradient-to-r from-amber-500 to-amber-600 p-2 rounded-full"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-5 w-5 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                          />
                        </svg>
                      </div>
                      <div>
                        <h4 class="font-bold text-amber-800 text-sm">
                          Premium Secure Service
                        </h4>
                        <p class="text-xs text-amber-700 mt-1">
                          Your shipment is handled with white-glove service —
                          tracked, monitored, and protected from pickup to
                          delivery.
                        </p>
                      </div>
                    </div>
                  </div>

                  <!-- Client Activity & Exclusivity -->
                  <div
                    class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 bg-gray-50 rounded-lg p-3 border border-gray-100"
                  >
                    <div class="flex items-start sm:items-center mb-2 sm:mb-0">
                      <div class="flex -space-x-2 sm:-space-x-3 mr-2 sm:mr-3">
                        <div
                          class="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-indigo-600 border-2 border-white flex items-center justify-center text-white text-xs shadow-sm"
                        >
                          E
                        </div>
                        <div
                          class="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-purple-600 border-2 border-white flex items-center justify-center text-white text-xs shadow-sm"
                        >
                          V
                        </div>
                        <div
                          class="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-blue-600 border-2 border-white flex items-center justify-center text-white text-xs shadow-sm"
                        >
                          P
                        </div>
                        <div
                          class="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-r from-gray-700 to-gray-900 border-2 border-white flex items-center justify-center text-white text-xs shadow-sm"
                        >
                          +24
                        </div>
                      </div>
                      <div>
                        <span class="text-xs text-gray-800 font-medium"
                          >Join our elite clientele</span
                        >
                        <p class="text-xs text-gray-600">
                          <span class="font-bold text-secondary"
                            >28 discerning customers</span
                          > securing premium deliveries right now
                        </p>
                      </div>
                    </div>
                    <div
                      class="flex items-center self-start sm:self-center bg-secondary/10 px-2 sm:px-3 py-1.5 rounded-full"
                    >
                      <div
                        class="w-2 h-2 bg-secondary rounded-full mr-1.5 sm:mr-2 animate-pulse"
                      ></div>
                      <span class="text-xs text-secondary font-semibold"
                        >High-demand timeframe</span
                      >
                    </div>
                  </div>

                  <!-- Real-time Insights -->
                  <div
                    class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4"
                  >
                    <div
                      class="bg-indigo-50 rounded-lg p-3 border border-indigo-100"
                    >
                      <div class="flex items-center">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-4 w-4 text-indigo-600 mr-2 flex-shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                          />
                        </svg>
                        <div>
                          <span class="text-xs text-indigo-900 font-semibold"
                            >Exclusive Opportunity</span
                          >
                          <p class="text-xs text-indigo-700 mt-0.5">
                            <span class="font-bold">9 premium orders</span> placed
                            in your area in the last hour
                          </p>
                        </div>
                      </div>
                    </div>

                    <div
                      class="bg-emerald-50 rounded-lg p-3 border border-emerald-100"
                    >
                      <div class="flex items-center">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-4 w-4 text-emerald-600 mr-2 flex-shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <div>
                          <span class="text-xs text-emerald-900 font-semibold"
                            >Priority Dispatch</span
                          >
                          <p class="text-xs text-emerald-700 mt-0.5">
                            Complete now for <span class="font-bold"
                              >guaranteed premium slot</span
                            >
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Exceptional Service Guarantees -->
                  <div
                    class="bg-white rounded-lg p-3 sm:p-4 border border-gray-200 shadow-sm mb-4"
                  >
                    <h4
                      class="font-semibold text-gray-800 text-sm mb-2 sm:mb-3 flex items-center"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-4 w-4 text-secondary mr-2 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                        />
                      </svg>
                      The Premium Promise
                    </h4>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                      <div class="flex items-start">
                        <div
                          class="bg-secondary/10 p-1.5 rounded-full mr-2 mt-0.5 flex-shrink-0"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-3.5 w-3.5 text-secondary"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </div>
                        <div>
                          <span class="text-xs font-medium text-gray-800"
                            >99.8% Exceptional Service</span
                          >
                          <p class="text-xs text-gray-600 mt-0.5">
                            Based on 10,000+ elite deliveries
                          </p>
                        </div>
                      </div>

                      <div class="flex items-start">
                        <div
                          class="bg-secondary/10 p-1.5 rounded-full mr-2 mt-0.5 flex-shrink-0"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-3.5 w-3.5 text-secondary"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                            />
                          </svg>
                        </div>
                        <div>
                          <span class="text-xs font-medium text-gray-800"
                            >Enterprise-Grade Security</span
                          >
                          <p class="text-xs text-gray-600 mt-0.5">
                            End-to-end protected delivery
                          </p>
                        </div>
                      </div>

                      <div class="flex items-start">
                        <div
                          class="bg-secondary/10 p-1.5 rounded-full mr-2 mt-0.5 flex-shrink-0"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-3.5 w-3.5 text-secondary"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                            />
                          </svg>
                        </div>
                        <div>
                          <span class="text-xs font-medium text-gray-800"
                            >Premium Insurance</span
                          >
                          <p class="text-xs text-gray-600 mt-0.5">
                            Comprehensive coverage included
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Customer Testimonial -->
                  <div
                    class="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-4 border border-gray-200 mb-5"
                  >
                    <div class="flex">
                      <div class="flex-shrink-0 mr-3">
                        <div
                          class="w-10 h-10 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center justify-center text-white font-medium text-sm"
                        >
                          MS
                        </div>
                      </div>
                      <div>
                        <div class="flex items-center mb-1">
                          <div class="flex">
                            {#each Array(5) as _, i}
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-3.5 w-3.5 text-amber-400"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path
                                  d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
                                />
                              </svg>
                            {/each}
                          </div>
                          <span class="text-xs text-gray-500 ml-2"
                            >2 days ago</span
                          >
                        </div>
                        <p class="text-xs text-gray-700 italic">
                          "The level of service exceeded all my expectations. My
                          package arrived ahead of schedule, and the courier was
                          incredibly professional. Worth every penny for the
                          peace of mind!"
                        </p>
                        <span
                          class="text-xs font-medium text-gray-800 mt-1 block"
                          >— Michael S., Executive Director</span
                        >
                      </div>
                    </div>
                  </div>

                  <!-- Limited Time Value Proposition -->
                  <div
                    class="bg-gradient-to-r from-secondary/5 to-secondary/10 rounded-lg p-4 border border-secondary/20 flex items-center mb-3"
                  >
                    <div class="bg-white rounded-full p-2 mr-3 shadow-sm">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5 text-secondary"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <div>
                      <h4 class="font-semibold text-secondary text-sm">
                        Limited Time Premium Rate
                      </h4>
                      <p class="text-xs text-gray-700 mt-1">
                        Current pricing reflects our premium service at
                        exceptional value. Reserve your delivery slot now before
                        rates adjust based on demand.
                      </p>
                    </div>
                  </div>

                  <!-- Trust Badges -->
                  <div class="flex items-center justify-between">
                    <div class="flex items-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-4 w-4 text-amber-500 mr-1.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                        />
                      </svg>
                      <span class="text-xs font-semibold text-gray-800"
                        >99.8% client satisfaction</span
                      >
                    </div>
                    <div class="flex items-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-4 w-4 text-emerald-500 mr-1.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                        />
                      </svg>
                      <span class="text-xs font-semibold text-gray-800"
                        >Encrypted & secure payment</span
                      >
                    </div>
                  </div>
                </div>

                <div class="flex gap-4">
                  <button
                    type="button"
                    on:click={() => (componentsOrder = 2)}
                    class="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                  >
                    Back
                  </button>

                  <!-- Payment Options Section -->
                  <div
                    class="bg-gray-50 p-4 rounded-lg mb-6 border border-gray-200"
                  >
                    <h4 class="text-sm font-medium text-gray-800 mb-3">
                      Payment Options
                    </h4>
                    <div class="space-y-3">
                      <label
                        class="flex items-center space-x-3 p-3 border rounded-lg border-gray-200 hover:border-secondary cursor-pointer transition-colors {paymentOption ===
                        'pay_now'
                          ? 'bg-secondary/10 border-secondary'
                          : ''}"
                      >
                        <input
                          type="radio"
                          name="paymentOption"
                          value="pay_now"
                          class="text-secondary focus:ring-secondary h-4 w-4"
                          bind:group={paymentOption}
                        />
                        <div>
                          <p class="font-medium text-sm">Pay now</p>
                          <p class="text-xs text-gray-500">
                            Complete payment immediately and get 5% off your
                            order!
                          </p>
                        </div>
                        <div
                          class="ml-auto bg-secondary/10 text-secondary text-xs font-medium px-2 py-1 rounded"
                        >
                          5% OFF
                        </div>
                      </label>

                      <label
                        class="flex items-center space-x-3 p-3 border rounded-lg border-gray-200 hover:border-secondary cursor-pointer transition-colors {paymentOption ===
                        'pay_on_acceptance'
                          ? 'bg-secondary/10 border-secondary'
                          : ''}"
                      >
                        <input
                          type="radio"
                          name="paymentOption"
                          value="pay_on_acceptance"
                          class="text-secondary focus:ring-secondary h-4 w-4"
                          bind:group={paymentOption}
                        />
                        <div>
                          <p class="font-medium text-sm">
                            Pay when order is accepted
                          </p>
                          <p class="text-xs text-gray-500">
                            Pay after a warehouse accepts your order
                          </p>
                        </div>
                      </label>

                      <label
                        class="flex items-center space-x-3 p-3 border rounded-lg border-gray-200 hover:border-secondary cursor-pointer transition-colors {paymentOption ===
                        'pay_on_delivery'
                          ? 'bg-secondary/10 border-secondary'
                          : ''}"
                      >
                        <input
                          type="radio"
                          name="paymentOption"
                          value="pay_on_delivery"
                          class="text-secondary focus:ring-secondary h-4 w-4"
                          bind:group={paymentOption}
                        />
                        <div>
                          <p class="font-medium text-sm">Pay on delivery</p>
                          <p class="text-xs text-gray-500">
                            Pay when your package is delivered (cash only)
                          </p>
                        </div>
                      </label>
                    </div>
                    <input
                      type="hidden"
                      name="paymentOption"
                      value={paymentOption}
                    />
                  </div>

                  <button
                    type="submit"
                    class="flex-1 bg-secondary text-white font-semibold py-3 px-6 rounded-lg hover:bg-secondary/90 transition-colors flex items-center justify-center group relative overflow-hidden"
                    disabled={isSubmitting}
                  >
                    <span class="relative z-10 flex items-center">
                      {#if isSubmitting}
                        <svg
                          class="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            class="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            stroke-width="4"
                          ></circle>
                          <path
                            class="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Processing...
                      {:else}
                        Complete Order
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-5 w-5 ml-2 transform transition-transform group-hover:translate-x-1"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M14 5l7 7m0 0l-7 7m7-7H3"
                          />
                        </svg>
                      {/if}
                    </span>
                    <span
                      class="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-secondary/0 via-white/20 to-secondary/0 transform -translate-x-full animate-shimmer"
                    ></span>
                  </button>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </form>
    </div>
  </div>

  <!-- Trust indicators -->
  <div class="mt-12 grid grid-cols-3 gap-6">
    <div class="text-center">
      <div
        class="bg-secondary/10 w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-3"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-6 w-6 text-secondary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      </div>
      <h3 class="font-medium text-gray-800">Secure Shipping</h3>
      <p class="text-sm text-gray-600">Your packages are fully insured</p>
    </div>

    <div class="text-center">
      <div
        class="bg-secondary/10 w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-3"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-6 w-6 text-secondary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <h3 class="font-medium text-gray-800">Real-time Tracking</h3>
      <p class="text-sm text-gray-600">Monitor your delivery 24/7</p>
    </div>

    <div class="text-center">
      <div
        class="bg-secondary/10 w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-3"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-6 w-6 text-secondary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
      <h3 class="font-medium text-gray-800">Guaranteed Delivery</h3>
      <p class="text-sm text-gray-600">On-time or money back</p>
    </div>
  </div>
</div>
