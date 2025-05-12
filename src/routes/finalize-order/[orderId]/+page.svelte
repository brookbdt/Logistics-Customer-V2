<script lang="ts">
  import { browser } from "$app/environment";
  import { goto, invalidate } from "$app/navigation";
  import dropOffIcon from "$lib/assets/shared/map/drop-off.svg";
  import pickUpIcon from "$lib/assets/shared/map/pick-up.svg";
  import GoogleMaps from "$lib/components/google-maps.svelte";
  import type { PackageType } from "@prisma/client";
  import { toast } from "@zerodevx/svelte-toast";
  import dayjs from "dayjs";
  import relativeTime from "dayjs/plugin/relativeTime";
  import { onDestroy, onMount } from "svelte";
  import { cubicOut } from "svelte/easing";
  import { tweened } from "svelte/motion";
  import { fade, fly, scale, slide } from "svelte/transition";
  import Payment from "./payment.svelte";
  // @ts-ignore
  // Import our new components
  import OrderAcceptedAnimation from "$lib/components/order-accepted-animation.svelte";
  // Import socket functionality for realtime updates
  import {
    initSocket,
    subscribeToOrder,
    isConnected,
  } from "$lib/socket/client";
  // Import driver tracking
  import {
    initDriverTracking,
    trackOrderDriver,
    driverLocations,
    onlineDrivers,
    activeDrivers,
  } from "$lib/socket/driver-tracking";

  import DriverLocationMap from "$lib/components/driver-location.map.svelte";
  //lol
  dayjs.extend(relativeTime);

  export let data;
  export let form;

  $: console.log({ data });

  let componentsOrder = 4;
  let animationComplete = false;
  let showOrderSummary = false;
  let processingProgress = tweened(0, { duration: 2000, easing: cubicOut });
  let processingStage = 0;
  let processingStages = [
    { text: "Verifying order details...", icon: "📋" },
    { text: "Finding the nearest warehouse...", icon: "🏢" },
    { text: "Calculating optimal route...", icon: "🗺️" },
    { text: "Preparing for dispatch...", icon: "🚚" },
    { text: "Almost there...", icon: "⏱️" },
  ];
  let interval: ReturnType<typeof setInterval>;
  let timeWaiting = 0;
  let firebaseUnsubscribe: Function | null = null;
  let showAcceptanceAnimation = false;
  let pulseEffect = false;
  let showTips = false;
  let currentTip = 0;
  let tipInterval: ReturnType<typeof setInterval>;
  // Driver tracking state
  let driverCoordinates: string | null = null;
  let driverIsOnline = false;
  let socketInitialized = false;
  let driverLocationPolling: ReturnType<typeof setInterval> | null = null;

  const deliveryTips = [
    "Premium customers get priority processing and exclusive discounts!",
    "Our system checks order status every few seconds - updates appear in real-time!",
    "We use AI-powered route optimization to ensure the fastest delivery.",
    "Once your order is accepted, you'll get instant notifications about status changes.",
    "Track your package in real-time once it's on the way!",
    "Our customer satisfaction rate is 98% - among the highest in the industry!",
    "Need help? Our 24/7 customer support is just a tap away.",
    "After order acceptance, you can view detailed tracking information in the Order Details page.",
  ];

  // Payment options handling
  $: isOrderAccepted = data.orderDetail?.orderStatus === "ACCEPTED";
  $: isOrderAssigned = data.orderDetail?.orderStatus === "ASSIGNED";
  $: isOrderInTransit = data.orderDetail?.orderStatus === "IN_TRANSIT";

  // Payment options - updated to match schema requirements
  $: canProceedToPayment =
    // Pay on pickup - unlocked when order is assigned (driver is on the way)
    (data.orderDetail?.paymentOption === "pay_on_pickup" &&
      (isOrderAssigned || isOrderInTransit) &&
      !data.orderDetail?.paymentStatus) ||
    // Pay now option - always available if not paid
    (data.orderDetail?.paymentOption === "pay_now" &&
      !data.orderDetail?.paymentStatus);

  // Get assigned driver info
  $: assignedDriver =
    data.orderDetail?.Dispatch?.AssignedEmployee?.User ||
    data.orderDetail?.Dispatch?.AssignedVendorDriver?.User;

  // Latest order dispatch with ASSIGNED or INPROGRESS status
  $: activeOrderDispatch = data.orderDetail?.OrderDispatch?.find((dispatch) =>
    ["ASSIGNED", "INPROGRESS"].includes(dispatch.dispatchStatus)
  );

  // Function to get driver info from order dispatches
  function getDriverInfo() {
    if (assignedDriver) {
      return {
        name: assignedDriver.userName || "Driver",
        phone: assignedDriver.phoneNumber || "N/A",
        vehicle: data.orderDetail?.vehicleType || "CAR",
      };
    }
    return null;
  }

  // Function to check if order has a milestone with specific description
  function hasOrderMilestone(description: string): boolean {
    return (
      data.orderDetail?.orderMilestone?.some((milestone) =>
        milestone.description.includes(description)
      ) || false
    );
  }

  // Function to handle proceeding to payment
  function handleProceedToPayment() {
    if (canProceedToPayment) {
      componentsOrder = 5;
    } else {
      // Show a toast notification explaining why they can't proceed
      let message = "Payment is not available at this time.";

      if (data.orderDetail?.paymentStatus) {
        message = "This order has already been paid for.";
      } else if (data.orderDetail?.paymentOption === "pay_on_delivery") {
        message = "This order is set to be paid upon delivery.";
      } else if (
        data.orderDetail?.paymentOption === "pay_on_pickup" &&
        !isOrderAssigned
      ) {
        message =
          "Please wait for a driver to be assigned before proceeding to payment.";
      }

      toast.push(message);
    }
  }

  // Automatically set the component order to 4 (review) if the order is not yet accepted
  $: if (!isOrderAccepted && componentsOrder === 5) {
    componentsOrder = 4;
  }

  // If payment option is pay_now, automatically show payment component
  $: if (
    data.orderDetail?.paymentOption === "pay_now" &&
    !data.orderDetail?.paymentStatus &&
    componentsOrder === 4
  ) {
    // Add a small delay so this doesn't run immediately
    setTimeout(() => {
      componentsOrder = 5; // Show payment component
    }, 1000);
  }

  let previousOrderStatus = data.orderDetail?.orderStatus;
  let pollingInterval: ReturnType<typeof setInterval>;

  async function pollOrderStatus() {
    if (!browser || !data.orderDetail?.id) return;

    // Initial polling interval - check every 5 seconds
    const INITIAL_POLLING_INTERVAL = 5000;
    // We'll increase the interval after the order is accepted
    const ACCEPTED_POLLING_INTERVAL = 15000;

    let currentPollingInterval = INITIAL_POLLING_INTERVAL;

    pollingInterval = setInterval(async () => {
      try {
        // This causes a re-fetch of the data using the load function
        await invalidate(`orders:${data.orderDetail?.id}`);

        // Check if order status has changed to ACCEPTED
        if (
          data.orderDetail?.orderStatus === "ACCEPTED" &&
          previousOrderStatus !== "ACCEPTED"
        ) {
          handleOrderAccepted();

          // After acceptance, we can poll less frequently
          clearInterval(pollingInterval);
          currentPollingInterval = ACCEPTED_POLLING_INTERVAL;
          pollingInterval = setInterval(async () => {
            try {
              await invalidate(`orders:${data.orderDetail?.id}`);
            } catch (error) {
              console.error("Error polling for order updates:", error);
            }
          }, currentPollingInterval);
        }

        // Update previous status for next comparison
        previousOrderStatus = data.orderDetail?.orderStatus;
      } catch (error) {
        console.error("Error polling for order updates:", error);
      }
    }, currentPollingInterval);

    return pollingInterval;
  }

  // Handle the order being accepted
  function handleOrderAccepted() {
    // Show celebration effects
    showAcceptanceAnimation = true;

    // Add pulse effect to UI
    pulseEffect = true;
    setTimeout(() => {
      pulseEffect = false;
    }, 5000);

    // Enable delivery tips display
    showTips = true;

    // Start cycling through delivery tips
    tipInterval = setInterval(() => {
      currentTip = (currentTip + 1) % deliveryTips.length;
    }, 8000);

    // Show toast notification
    toast.push(
      "🎉 Great news! Your order has been accepted and is ready for payment!",
      {
        theme: {
          "--toastBackground": "#10B981",
          "--toastColor": "white",
          "--toastBarBackground": "#059669",
        },
        duration: 6000,
      }
    );
  }

  onMount(() => {
    // Simulate processing animation
    processingProgress.set(0);
    processingStage = 0;

    // Update processing stage every few seconds
    interval = setInterval(() => {
      if (processingStage < processingStages.length - 1) {
        processingStage++;
        processingProgress.set((processingStage + 1) / processingStages.length);
      } else {
        processingStage = 0;
        processingProgress.set(0.2);
      }

      // Only increment wait time if order not accepted
      if (!isOrderAccepted) {
        timeWaiting++;
      }
    }, 3000);

    // Show order summary
    setTimeout(() => {
      showOrderSummary = true;
    }, 1000);

    // Setup polling for order status - this is our primary update mechanism
    pollOrderStatus();

    // Initialize socket connection for real-time updates
    if (browser && data.orderDetail?.id && !socketInitialized) {
      socketInitialized = true;
      console.log(`Initializing socket for order: ${data.orderDetail.id}`);

      // Initialize socket connection
      initSocket()
        .then(() => {
          // Initialize driver tracking
          initDriverTracking();

          // Subscribe to this specific order
          if (data.orderDetail?.id) {
            console.log(`Subscribing to order: ${data.orderDetail.id}`);
            subscribeToOrder(data.orderDetail.id);
            trackOrderDriver(data.orderDetail.id);

            // Setup fallback polling
            setupDriverPolling();
          }
        })
        .catch((error) => {
          console.error("Socket initialization failed:", error);
          // Still setup fallback polling if socket fails
          setupDriverPolling();
        });
    }
  });

  onDestroy(() => {
    clearInterval(interval);

    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    if (tipInterval) {
      clearInterval(tipInterval);
    }

    // Clear driver location polling
    if (driverLocationPolling) {
      clearInterval(driverLocationPolling);
    }
  });

  // Extract coordinates from mapLocation strings
  let pickupCoordinates = { lat: 0, lng: 0 };
  let dropoffCoordinates = { lat: 0, lng: 0 };

  if (data.orderDetail?.pickUpMapLocation) {
    const coords = data.orderDetail.pickUpMapLocation.split(",").map(Number);
    if (coords.length === 2) {
      pickupCoordinates = { lat: coords[0], lng: coords[1] };
    }
  }

  if (data.orderDetail?.dropOffMapLocation) {
    const coords = data.orderDetail.dropOffMapLocation.split(",").map(Number);
    if (coords.length === 2) {
      dropoffCoordinates = { lat: coords[0], lng: coords[1] };
    }
  }

  // For debugging
  console.log("Pickup coordinates:", pickupCoordinates);
  console.log("Dropoff coordinates:", dropoffCoordinates);

  // Order details directly from orderDetail
  let packageType: PackageType | null = data.orderDetail?.packageType ?? null;
  let estimatedDeliveryTime = "";

  // Order options from order data
  let orderType = data.orderDetail?.orderType || "STANDARD";
  let goodsType = data.orderDetail?.goodsType || "NORMAL";
  let packagingType = data.orderDetail?.packagingType || "STANDARD_BOX";
  let vehicleType = data.orderDetail?.vehicleType || "CAR";
  let actualWeight = data.orderDetail?.actualWeight || 0.5;
  let length = null;
  let width = null;
  let height = null;

  // If we have dimensional weight, calculate dimensions
  if (data.orderDetail?.dimensionalWeight) {
    // Estimate dimensions based on dimensional weight formula: L*W*H/5000
    // Assuming a cube for simplicity
    const cubicVolume = data.orderDetail.dimensionalWeight * 5000;
    const dimension = Math.cbrt(cubicVolume);
    length = dimension;
    width = dimension;
    height = dimension;
  }

  // Calculate dimensional weight if dimensions are available
  let dimensionalWeight = data.orderDetail?.dimensionalWeight || 0;

  // Use the higher of actual weight or dimensional weight
  let effectiveWeight =
    data.orderDetail?.effectiveWeight ||
    Math.max(actualWeight, dimensionalWeight);

  // Calculate estimated delivery time based on order type
  $: {
    const now = dayjs();
    if (orderType === "SAME_DAY") {
      estimatedDeliveryTime = "Today by " + now.add(8, "hour").format("h:mm A");
    } else if (orderType === "EXPRESS") {
      estimatedDeliveryTime = now.add(1, "day").format("ddd, MMM D");
    } else {
      estimatedDeliveryTime = now.add(3, "day").format("ddd, MMM D");
    }
  }

  // Progress percentage calculation
  $: progressPercentage = ((componentsOrder - 1) / 4) * 100;

  // Function to format price
  function formatPrice(price: number): string {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  }

  // Function to contact support
  function contactSupport() {
    goto("/support");
  }

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
      const city = data.orderDetail?.originCity || "Addis Ababa";
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

  // Helper function to get vehicle multiplier safely
  function getVehicleMultiplier(): number {
    try {
      const city = data.orderDetail?.originCity || "Addis Ababa";
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

  // Function to handle route calculation events from GoogleMaps component
  function handleRouteCalculated(
    event: CustomEvent<{ distance: number; duration: number }>
  ) {
    const details = event.detail;

    // Only update if orderDetail doesn't already have these values and orderDetail exists
    if (data.orderDetail) {
      if (!data.orderDetail.distanceInKm && details.distance) {
        console.log(
          "Updating distance from route calculation:",
          details.distance
        );
        data.orderDetail.distanceInKm = details.distance;
      }

      if (!data.orderDetail.estimatedTimeInMinutes && details.duration) {
        console.log("Updating time from route calculation:", details.duration);
        data.orderDetail.estimatedTimeInMinutes = details.duration;
      }
    }
  }

  // Get driver coordinates from the driver tracking system
  $: {
    if (assignedDriver && data.orderDetail?.id) {
      const driverId = assignedDriver.id.toString();
      const driverData = $driverLocations[driverId];
      const driverOnlineStatus = $onlineDrivers[driverId];

      if (driverData?.coordinates) {
        driverCoordinates = driverData.coordinates;
        console.log(`Driver location updated: ${driverCoordinates}`);
      }

      driverIsOnline = driverOnlineStatus?.isOnline || false;
    }
  }

  // Socket connection status for debugging
  $: if (assignedDriver) {
    console.log(
      "Socket connected:",
      $isConnected,
      "Driver online:",
      driverIsOnline
    );
  }

  // Setup periodic driver data refresh as a fallback
  function setupDriverPolling() {
    // Clear any existing polling
    if (driverLocationPolling) {
      clearInterval(driverLocationPolling);
    }

    // Poll for driver updates every 10 seconds as a fallback for socket
    driverLocationPolling = setInterval(() => {
      if (assignedDriver && data.orderDetail?.id) {
        console.log("Polling for driver location...");
        trackOrderDriver(data.orderDetail.id);
      }
    }, 10000);
  }
</script>

<div class="min-h-screen bg-gray-50 flex flex-col">
  <!-- Header with improved progress steps -->
  <div class="bg-white shadow-sm sticky top-0 z-10">
    <div class="max-w-md mx-auto px-4 py-4">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-bold text-gray-800">Finalize Order</h1>
        <span
          class="text-sm font-medium text-secondary bg-secondary/10 px-3 py-1 rounded-full"
          >Order #{data.orderDetail?.id}</span
        >
      </div>

      <!-- Elegant Progress bar similar to create-order page -->
      <div class="mb-6">
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
                  : 'bg-gray-200 text-gray-500'} rounded-full h-8 w-8 sm:h-10 sm:w-10 flex justify-center items-center transition-all duration-300 shadow-md hover:shadow-lg"
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
                  : 'bg-gray-200 text-gray-500'} rounded-full h-8 w-8 sm:h-10 sm:w-10 flex justify-center items-center transition-all duration-300 shadow-md hover:shadow-lg"
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
                  : 'bg-gray-200 text-gray-500'} rounded-full h-8 w-8 sm:h-10 sm:w-10 flex justify-center items-center transition-all duration-300 shadow-md hover:shadow-lg"
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
              <button
                on:click={() =>
                  componentsOrder >= 4 ? (componentsOrder = 4) : null}
                class="{componentsOrder >= 4
                  ? 'bg-secondary text-white'
                  : 'bg-gray-200 text-gray-500'} rounded-full h-8 w-8 sm:h-10 sm:w-10 flex justify-center items-center transition-all duration-300 shadow-md hover:shadow-lg"
              >
                4
              </button>
              <span
                class="text-xs mt-2 font-medium {componentsOrder >= 4
                  ? 'text-secondary'
                  : 'text-gray-500'}"
              >
                Review
              </span>
            </div>

            <div class="flex flex-col items-center">
              <div
                class="{componentsOrder >= 5
                  ? 'bg-secondary text-white'
                  : 'bg-gray-200 text-gray-500'} rounded-full h-8 w-8 sm:h-10 sm:w-10 flex justify-center items-center transition-all duration-300 shadow-md"
              >
                5
              </div>
              <span
                class="text-xs mt-2 font-medium {componentsOrder >= 5
                  ? 'text-secondary'
                  : 'text-gray-500'}"
              >
                Payment
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Main content -->
  <div class="flex-1 max-w-md mx-auto w-full px-4 py-4">
    <!-- Sender Info (Step 1) -->
    {#if componentsOrder === 1}
      <div in:fade={{ duration: 300 }} class="space-y-6">
        <div class="mb-6">
          <h2 class="text-xl font-bold text-gray-800 mb-2">
            Sender Information
          </h2>
          <p class="text-gray-600 text-sm">
            Details about where we'll pick up your package
          </p>
        </div>

        <div class="bg-white rounded-xl shadow-md overflow-hidden">
          <div class="p-5">
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  {data.orderDetail?.Sender?.User?.userName || "N/A"}
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  {data.orderDetail?.Sender?.User?.phoneNumber || "N/A"}
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Pickup Date
                </label>
                <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  {data.orderDetail?.pickUpTime
                    ? dayjs(data.orderDetail.pickUpTime).format("MMM D, YYYY")
                    : "N/A"}
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Pickup Address
                </label>
                <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  {data.orderDetail?.pickUpPhysicalLocation || "N/A"}
                </div>
              </div>

              <!-- Map View -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Pickup Location
                </label>
                <div
                  class="h-56 rounded-lg overflow-hidden border border-gray-200"
                >
                  {#if pickupCoordinates.lat && pickupCoordinates.lng}
                    <GoogleMaps
                      lat={dropoffCoordinates.lat}
                      lng={dropoffCoordinates.lng}
                      destinationLat={pickupCoordinates.lat}
                      destinationLng={pickupCoordinates.lng}
                      display={true}
                      showSearchBox={false}
                      showRoute={dropoffCoordinates.lat &&
                      dropoffCoordinates.lng
                        ? true
                        : false}
                      mapId="pickupMap"
                      on:routeCalculated={handleRouteCalculated}
                    />
                    <!-- Add a legend below the map -->
                    <div class="flex items-center mt-2 text-xs text-gray-600">
                      <img src={pickUpIcon} alt="Pickup" class="w-4 h-4 mr-1" />
                      <span
                        >Pickup Location: {data.orderDetail
                          ?.pickUpPhysicalLocation || ""}</span
                      >
                    </div>
                    {#if dropoffCoordinates.lat && dropoffCoordinates.lng}
                      <div class="flex items-center mt-1 text-xs text-gray-600">
                        <img
                          src={dropOffIcon}
                          alt="Delivery"
                          class="w-4 h-4 mr-1"
                        />
                        <span
                          >Delivery Location: {data.orderDetail
                            ?.dropOffPhysicalLocation || ""}</span
                        >
                      </div>
                    {/if}
                  {:else}
                    <div
                      class="h-full flex items-center justify-center bg-gray-100"
                    >
                      <p class="text-gray-500">
                        No location coordinates available
                      </p>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex justify-end mt-6">
          <button
            on:click={() => (componentsOrder = 2)}
            class="bg-secondary text-white font-medium py-3 px-6 rounded-lg hover:bg-secondary/90 transition-colors flex items-center gap-2"
          >
            Continue
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
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
          </button>
        </div>
      </div>
    {/if}

    <!-- Receiver Info (Step 2) -->
    {#if componentsOrder === 2}
      <div in:fade={{ duration: 300 }} class="space-y-6">
        <div class="mb-6">
          <h2 class="text-xl font-bold text-gray-800 mb-2">
            Receiver Information
          </h2>
          <p class="text-gray-600 text-sm">
            Details about where we'll deliver your package
          </p>
        </div>

        <div class="bg-white rounded-xl shadow-md overflow-hidden">
          <div class="p-5">
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  {data.orderDetail?.receiverName ||
                    data.orderDetail?.Receiver?.User?.userName ||
                    "N/A"}
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  {data.orderDetail?.receiverPhoneNumber ||
                    data.orderDetail?.Receiver?.User?.phoneNumber ||
                    "N/A"}
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  {data.orderDetail?.receiverEmail ||
                    data.orderDetail?.Receiver?.User?.email ||
                    "N/A"}
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Delivery Date
                </label>
                <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  {data.orderDetail?.dropOffTime
                    ? dayjs(data.orderDetail.dropOffTime).format("MMM D, YYYY")
                    : "N/A"}
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Delivery Address
                </label>
                <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  {data.orderDetail?.dropOffPhysicalLocation || "N/A"}
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Delivery Type
                </label>
                <div
                  class="p-3 bg-gray-50 rounded-lg border border-gray-200 font-medium"
                >
                  {data.orderDetail?.isInCity
                    ? "In-City Delivery"
                    : "Between-Cities Delivery"}
                  <span class="block text-xs text-gray-500 mt-1">
                    {data.orderDetail?.originCity || ""}
                    {data.orderDetail?.destinationCity
                      ? `to ${data.orderDetail.destinationCity}`
                      : ""}
                  </span>
                </div>
              </div>

              <!-- Map View -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Delivery Location
                </label>
                <div
                  class="h-56 rounded-lg overflow-hidden border border-gray-200"
                >
                  {#if dropoffCoordinates.lat && dropoffCoordinates.lng}
                    <GoogleMaps
                      lat={dropoffCoordinates.lat}
                      lng={dropoffCoordinates.lng}
                      destinationLat={pickupCoordinates.lat}
                      destinationLng={pickupCoordinates.lng}
                      display={true}
                      showSearchBox={false}
                      showRoute={pickupCoordinates.lat && pickupCoordinates.lng
                        ? true
                        : false}
                      mapId="dropoffMap"
                      on:routeCalculated={handleRouteCalculated}
                    />
                    <!-- Add a legend below the map -->
                    <div class="flex items-center mt-2 text-xs text-gray-600">
                      <img
                        src={dropOffIcon}
                        alt="Delivery"
                        class="w-4 h-4 mr-1"
                      />
                      <span
                        >Delivery Location: {data.orderDetail
                          ?.dropOffPhysicalLocation || ""}</span
                      >
                    </div>
                    {#if pickupCoordinates.lat && pickupCoordinates.lng}
                      <div class="flex items-center mt-1 text-xs text-gray-600">
                        <img
                          src={pickUpIcon}
                          alt="Pickup"
                          class="w-4 h-4 mr-1"
                        />
                        <span
                          >Pickup Location: {data.orderDetail
                            ?.pickUpPhysicalLocation || ""}</span
                        >
                      </div>
                    {/if}
                  {:else}
                    <div
                      class="h-full flex items-center justify-center bg-gray-100"
                    >
                      <p class="text-gray-500">
                        No location coordinates available
                      </p>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex justify-between mt-6">
          <button
            on:click={() => (componentsOrder = 1)}
            class="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Back
          </button>

          <button
            on:click={() => (componentsOrder = 3)}
            class="bg-secondary text-white font-medium py-3 px-6 rounded-lg hover:bg-secondary/90 transition-colors flex items-center gap-2"
          >
            Continue
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
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
          </button>
        </div>
      </div>
    {/if}

    <!-- Package Info (Step 3) -->
    {#if componentsOrder === 3}
      <div in:fade={{ duration: 300 }} class="space-y-6">
        <div class="mb-6">
          <h2 class="text-xl font-bold text-gray-800 mb-2">Package Details</h2>
          <p class="text-gray-600 text-sm">
            Information about your package and delivery options
          </p>
        </div>

        <div class="bg-white rounded-xl shadow-md overflow-hidden mb-6">
          <div class="p-5">
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Package Type
                </label>
                <div
                  class="p-3 bg-gray-50 rounded-lg border border-gray-200 font-medium"
                >
                  {packageType}
                </div>
              </div>

              <!-- Package Options Display -->
              <div
                class="mt-8 bg-gray-50 p-4 sm:p-6 rounded-lg border border-gray-200"
              >
                <h3 class="text-lg font-semibold text-gray-800 mb-4">
                  Delivery Options
                </h3>

                <!-- Order Type Selection -->
                <div class="mb-5">
                  <label class="block text-sm font-medium text-gray-700 mb-2"
                    >Delivery Speed</label
                  >
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                    <div
                      class="flex items-center p-3 sm:p-4 border rounded-lg {orderType ===
                      'STANDARD'
                        ? 'bg-secondary/10 border-secondary text-secondary'
                        : 'border-gray-200 text-gray-700'}"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5 sm:h-6 sm:w-6 mr-3 {orderType ===
                        'STANDARD'
                          ? 'text-secondary'
                          : 'text-gray-500'}"
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
                    </div>

                    <div
                      class="flex items-center p-3 sm:p-4 border rounded-lg {orderType ===
                      'EXPRESS'
                        ? 'bg-secondary/10 border-secondary text-secondary'
                        : 'border-gray-200 text-gray-700'}"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5 sm:h-6 sm:w-6 mr-3 {orderType ===
                        'EXPRESS'
                          ? 'text-secondary'
                          : 'text-gray-500'}"
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
                    </div>

                    <div
                      class="flex items-center p-3 sm:p-4 border rounded-lg {orderType ===
                      'SAME_DAY'
                        ? 'bg-secondary/10 border-secondary text-secondary'
                        : 'border-gray-200 text-gray-700'}"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5 sm:h-6 sm:w-6 mr-3 {orderType ===
                        'SAME_DAY'
                          ? 'text-secondary'
                          : 'text-gray-500'}"
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
                    </div>
                  </div>
                </div>

                <!-- Goods Type Selection -->
                <div class="mb-5">
                  <label class="block text-sm font-medium text-gray-700 mb-2"
                    >Goods Type</label
                  >
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                    <div
                      class="flex items-center p-3 sm:p-4 border rounded-lg {goodsType.toString() ===
                      'NORMAL'
                        ? 'bg-secondary/10 border-secondary text-secondary'
                        : 'border-gray-200 text-gray-700'}"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5 sm:h-6 sm:w-6 mr-3 {goodsType.toString() ===
                        'NORMAL'
                          ? 'text-secondary'
                          : 'text-gray-500'}"
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
                        <span class="text-sm font-medium">Normal</span>
                        <span class="text-xs text-gray-500 block sm:mt-1"
                          >Standard items</span
                        >
                      </div>
                    </div>

                    <div
                      class="flex items-center p-3 sm:p-4 border rounded-lg {goodsType.toString() ===
                      'FRAGILE'
                        ? 'bg-secondary/10 border-secondary text-secondary'
                        : 'border-gray-200 text-gray-700'}"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5 sm:h-6 sm:w-6 mr-3 {goodsType.toString() ===
                        'FRAGILE'
                          ? 'text-secondary'
                          : 'text-gray-500'}"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                        />
                      </svg>
                      <div>
                        <span class="text-sm font-medium">Fragile</span>
                        <span class="text-xs text-gray-500 block sm:mt-1"
                          >Handle with care</span
                        >
                      </div>
                    </div>

                    <div
                      class="flex items-center p-3 sm:p-4 border rounded-lg {goodsType.toString() ===
                      'PERISHABLE'
                        ? 'bg-secondary/10 border-secondary text-secondary'
                        : 'border-gray-200 text-gray-700'}"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5 sm:h-6 sm:w-6 mr-3 {goodsType.toString() ===
                        'PERISHABLE'
                          ? 'text-secondary'
                          : 'text-gray-500'}"
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
                        <span class="text-sm font-medium">Perishable</span>
                        <span class="text-xs text-gray-500 block sm:mt-1"
                          >Time-sensitive</span
                        >
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Packaging Type Selection -->
                <div class="mb-5">
                  <label class="block text-sm font-medium text-gray-700 mb-2"
                    >Packaging Type</label
                  >
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                    {#each getAvailablePackagingOptions() as option}
                      <div
                        class="flex items-center p-3 sm:p-4 border rounded-lg {packagingType ===
                        option
                          ? 'bg-secondary/10 border-secondary text-secondary'
                          : 'border-gray-200 text-gray-700'}"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-5 w-5 sm:h-6 sm:w-6 mr-3 {packagingType ===
                          option
                            ? 'text-secondary'
                            : 'text-gray-500'}"
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
                          <span class="text-sm font-medium"
                            >{option.replace("_", " ")}</span
                          >
                          <span class="text-xs text-gray-500 block sm:mt-1">
                            {#if option === "STANDARD_BOX"}
                              Basic packaging
                            {:else if option === "PREMIUM_BOX"}
                              Enhanced protection
                            {:else if option === "SPECIALTY"}
                              Special handling
                            {:else if option === "CUSTOM"}
                              Custom packaging
                            {/if}
                          </span>
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>

                <!-- Vehicle Type Selection (only show if in-city) -->
                {#if !data.orderDetail?.isInCity}
                  <div class="mb-5">
                    <label class="block text-sm font-medium text-gray-700 mb-2"
                      >Vehicle Type</label
                    >
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                      {#each getAvailableVehicleTypes() as type}
                        <div
                          class="flex items-center p-3 sm:p-4 border rounded-lg {vehicleType ===
                          type
                            ? 'bg-secondary/10 border-secondary text-secondary'
                            : 'border-gray-200 text-gray-700'}"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-5 w-5 sm:h-6 sm:w-6 mr-3 {vehicleType ===
                            type
                              ? 'text-secondary'
                              : 'text-gray-500'}"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            {#if type === "BIKE"}
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"
                              />
                            {:else if type === "CAR"}
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z"
                              />
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"
                              />
                            {:else if type === "TRUCK"}
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z"
                              />
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"
                              />
                            {/if}
                          </svg>
                          <div>
                            <span class="text-sm font-medium">{type}</span>
                            <span class="text-xs text-gray-500 block sm:mt-1">
                              {#if type === "BIKE"}
                                Small packages
                              {:else if type === "CAR"}
                                Medium packages
                              {:else if type === "TRUCK"}
                                Large packages
                              {/if}
                            </span>
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}

                <!-- Package Dimensions -->
                <div class="mt-6 sm:mt-8">
                  <h3
                    class="text-base sm:text-lg font-semibold text-gray-800 mb-3 sm:mb-4"
                  >
                    Package Dimensions
                  </h3>
                  <div class="grid grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">
                    <div>
                      <label
                        class="block text-xs sm:text-sm font-medium text-gray-700 mb-1"
                        >Length (cm)</label
                      >
                      <div
                        class="p-2 sm:p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs sm:text-sm"
                      >
                        {length ? length.toFixed(1) : "N/A"}
                      </div>
                    </div>
                    <div>
                      <label
                        class="block text-xs sm:text-sm font-medium text-gray-700 mb-1"
                        >Width (cm)</label
                      >
                      <div
                        class="p-2 sm:p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs sm:text-sm"
                      >
                        {width ? width.toFixed(1) : "N/A"}
                      </div>
                    </div>
                    <div>
                      <label
                        for="height-display"
                        class="block text-sm font-medium text-gray-700 mb-1"
                        >Height (cm)</label
                      >
                      <div
                        id="height-display"
                        class="p-3 bg-gray-50 rounded-lg border border-gray-200"
                        aria-live="polite"
                      >
                        {height ? height.toFixed(1) : "N/A"}
                      </div>
                    </div>
                    <div>
                      <label
                        for="weight-display"
                        class="block text-sm font-medium text-gray-700 mb-1"
                        >Weight (kg)</label
                      >
                      <div
                        id="weight-display"
                        class="p-3 bg-gray-50 rounded-lg border border-gray-200"
                        aria-live="polite"
                      >
                        {actualWeight.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {#if dimensionalWeight > 0}
                    <div
                      class="bg-blue-50 p-3 rounded-lg border border-blue-100 text-sm text-blue-800"
                    >
                      <p class="font-medium">
                        Dimensional Weight: {dimensionalWeight.toFixed(2)} kg
                      </p>
                      <p class="text-xs mt-1">
                        For shipping purposes, we use the greater of actual
                        weight or dimensional weight.
                      </p>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex justify-between mt-6">
          <button
            on:click={() => (componentsOrder = 2)}
            class="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Back
          </button>

          <button
            on:click={() => (componentsOrder = 4)}
            class="bg-secondary text-white font-medium py-3 px-6 rounded-lg hover:bg-secondary/90 transition-colors flex items-center gap-2"
          >
            Continue
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
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
          </button>
        </div>
      </div>
    {/if}

    <!-- Order Review (Step 4) -->
    {#if componentsOrder === 4}
      <div in:fade={{ duration: 300 }} class="space-y-6">
        <div class="mb-6">
          <h2 class="text-xl font-bold text-gray-800 mb-2">Review Order</h2>
          <p class="text-gray-600 text-sm">
            Review your order details and proceed to payment
          </p>
        </div>

        <!-- Order Accepted Animation -->
        <OrderAcceptedAnimation
          show={showAcceptanceAnimation}
          onComplete={() => {
            showAcceptanceAnimation = false;
          }}
          duration={5000}
        />

        <!-- ... existing code ... -->

        <!-- Order Processing Animation - Only show when waiting for acceptance -->
        {#if !isOrderAccepted && !isOrderAssigned && !isOrderInTransit}
          <div class="bg-white rounded-xl shadow-md overflow-hidden mb-6">
            <div class="p-5">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-gray-800">
                  Order Processing
                </h3>
                <span
                  class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                >
                  <span
                    class="w-2 h-2 bg-blue-500 rounded-full mr-1.5 animate-pulse"
                  ></span>
                  Awaiting Acceptance
                </span>
              </div>

              <!-- Progress Bar -->
              <div class="mb-4">
                <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-secondary transition-all duration-1000 ease-out"
                    style="width: {$processingProgress * 100}%"
                  ></div>
                </div>
              </div>

              <!-- Processing Stage -->
              <div
                class="flex items-center p-4 bg-gray-50 rounded-lg border border-gray-200 mb-4"
                class:animate-pulse={pulseEffect}
              >
                <div
                  class="flex-shrink-0 w-10 h-10 bg-secondary/20 rounded-full flex items-center justify-center mr-4 text-xl"
                >
                  {processingStages[processingStage].icon}
                </div>
                <div class="flex-grow">
                  <p class="font-medium text-gray-800">
                    {processingStages[processingStage].text}
                  </p>
                  <p class="text-sm text-gray-500 mt-1">
                    Your order is being processed by our warehouse team. This
                    may take a few moments.
                  </p>
                </div>
                <div class="ml-2 flex-shrink-0">
                  <span
                    class="inline-flex h-2 w-2 rounded-full bg-secondary animate-ping opacity-75"
                  ></span>
                </div>
              </div>

              <!-- Waiting Message -->
              {#if timeWaiting > 10}
                <div
                  class="p-4 bg-yellow-50 rounded-lg border border-yellow-100 mb-4"
                  in:slide={{ duration: 300 }}
                >
                  <div class="flex items-center">
                    <div class="mr-3 text-yellow-500">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5"
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
                    </div>
                    <div>
                      <p class="text-sm text-yellow-800">
                        We're still working on processing your order. This might
                        take a bit longer than usual due to high demand.
                      </p>
                      <p class="text-xs text-yellow-600 mt-1">
                        Updates will appear automatically when available. No
                        need to refresh.
                      </p>
                    </div>
                  </div>
                </div>
              {/if}

              <!-- Delivery Tips -->
              {#if showTips}
                <div
                  class="p-4 bg-blue-50 rounded-lg border border-blue-100"
                  in:slide={{ duration: 300 }}
                >
                  <h4 class="font-medium text-blue-800 mb-1">Did you know?</h4>
                  <p class="text-sm text-blue-800">
                    {deliveryTips[currentTip]}
                  </p>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Order Accepted Message - Show when order is accepted -->
        {#if isOrderAccepted && !isOrderAssigned && !isOrderInTransit && !data.orderDetail?.paymentStatus && componentsOrder === 4}
          <div
            class="bg-gradient-to-br from-green-50 to-green-100 rounded-xl shadow-lg overflow-hidden mb-6"
            in:fly={{ y: 20, duration: 500 }}
          >
            <div class="p-5">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-green-800">
                  <span class="mr-2">✅</span>
                  Order Accepted
                </h3>
                <span
                  class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-200 text-green-800"
                >
                  <span
                    class="w-2 h-2 bg-green-500 rounded-full mr-1.5 animate-pulse"
                  ></span>
                  Warehouse Processing
                </span>
              </div>

              <p class="text-sm text-green-700 mb-4">
                Great news! Your order has been accepted by our warehouse team
                and is being prepared.
                {#if data.orderDetail?.paymentOption === "pay_now" || data.orderDetail?.paymentOption === "pay_on_acceptance"}
                  Please complete your payment to proceed with delivery.
                {:else}
                  We're working on assigning a driver to your order.
                {/if}
              </p>

              <!-- Order flow visualization -->
              <div
                class="flex items-center justify-between mb-6 p-3 bg-white rounded-lg"
              >
                <div class="flex flex-col items-center">
                  <div
                    class="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-5 w-5"
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
                  <span class="text-xs text-green-800 font-medium mt-1"
                    >Accepted</span
                  >
                </div>
                <div class="flex-1 mx-1 h-1 bg-gray-200 relative">
                  <div
                    class="absolute inset-0 bg-green-500"
                    style="width: 0%"
                  ></div>
                </div>
                <div class="flex flex-col items-center">
                  <div
                    class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-400"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                  </div>
                  <span class="text-xs text-gray-500 font-medium mt-1"
                    >Driver Assigned</span
                  >
                </div>
                <div class="flex-1 mx-1 h-1 bg-gray-200"></div>
                <div class="flex flex-col items-center">
                  <div
                    class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-400"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M17 8l4 4m0 0l-4 4m4-4H3"
                      />
                    </svg>
                  </div>
                  <span class="text-xs text-gray-500 font-medium mt-1"
                    >In Transit</span
                  >
                </div>
              </div>

              <!-- CTA Button for payment if needed -->
              {#if data.orderDetail?.paymentOption === "pay_now" || data.orderDetail?.paymentOption === "pay_on_acceptance"}
                <div class="mt-4 flex justify-center">
                  <button
                    on:click={handleProceedToPayment}
                    class="w-full sm:w-auto bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-3 px-6 sm:px-8 rounded-lg shadow-md hover:shadow-lg flex items-center justify-center gap-2 transform hover:translate-y-[-2px] transition-all duration-200"
                  >
                    Proceed to Payment
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M17 8l4 4m0 0l-4 4m4-4H3"
                      />
                    </svg>
                  </button>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Order Already Paid Message - Show when order is paid -->
        {#if isOrderAccepted && data.orderDetail?.paymentStatus}
          <div
            class="bg-blue-50 rounded-xl shadow-md overflow-hidden mb-6"
            in:fly={{ y: 20, duration: 500 }}
          >
            <div class="p-5">
              <div class="flex items-start">
                <div
                  class="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-4"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-6 w-6 text-blue-600"
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
                  <h3 class="text-lg font-semibold text-blue-800">
                    Payment Completed
                  </h3>
                  <p class="text-sm text-blue-700 mt-1">
                    Your order has been paid for and is now being prepared for
                    delivery. You can track your order status in the orders
                    section.
                  </p>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <!-- Order Summary - Always show -->
        {#if showOrderSummary}
          <div
            class="bg-white rounded-xl shadow-md overflow-hidden mb-6"
            in:fly={{ y: 20, duration: 500, delay: 300 }}
          >
            <!-- Order summary content remains the same -->
            <div class="p-5">
              <h3 class="text-lg font-semibold text-gray-800 mb-4">
                Order Summary
              </h3>

              <!-- Sender & Receiver Info -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h4 class="font-medium text-gray-700 mb-2">Sender</h4>
                  <p class="text-sm text-gray-800">
                    {data.orderDetail?.Sender?.User?.userName || "N/A"}
                  </p>
                  <p class="text-sm text-gray-600 mt-1">
                    {data.orderDetail?.Sender?.User?.phoneNumber || "N/A"}
                  </p>
                  <p class="text-sm text-gray-600 mt-1">
                    {data.orderDetail?.pickUpPhysicalLocation || "N/A"}
                  </p>
                </div>

                <div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h4 class="font-medium text-gray-700 mb-2">Receiver</h4>
                  <p class="text-sm text-gray-800">
                    {data.orderDetail?.receiverName ||
                      data.orderDetail?.Receiver?.User?.userName ||
                      "N/A"}
                  </p>
                  <p class="text-sm text-gray-600 mt-1">
                    {data.orderDetail?.receiverPhoneNumber ||
                      data.orderDetail?.Receiver?.User?.phoneNumber ||
                      "N/A"}
                  </p>
                  <p class="text-sm text-gray-600 mt-1">
                    {data.orderDetail?.dropOffPhysicalLocation || "N/A"}
                  </p>
                </div>
              </div>

              <!-- Map with Route -->
              {#if pickupCoordinates.lat && pickupCoordinates.lng && dropoffCoordinates.lat && dropoffCoordinates.lng}
                <div class="mb-6">
                  <h4 class="font-medium text-gray-700 mb-2">
                    Delivery Route Map
                  </h4>
                  <div
                    class="h-64 sm:h-80 rounded-lg overflow-hidden border border-gray-200 shadow-sm"
                  >
                    <GoogleMaps
                      lat={dropoffCoordinates.lat}
                      lng={dropoffCoordinates.lng}
                      destinationLat={pickupCoordinates.lat}
                      destinationLng={pickupCoordinates.lng}
                      display={true}
                      showSearchBox={false}
                      showRoute={true}
                      mapId="summaryMap"
                      on:routeCalculated={handleRouteCalculated}
                    />
                  </div>
                  <!-- Route legend -->
                  <div
                    class="flex justify-between mt-3 text-xs text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-200"
                  >
                    <div class="flex items-center">
                      <img src={pickUpIcon} alt="Pickup" class="w-4 h-4 mr-1" />
                      <span class="text-xs font-medium"
                        >{data.orderDetail?.originCity || "Pickup"}</span
                      >
                      <span class="ml-1 text-xs text-gray-500"
                        >{data.orderDetail?.pickUpPhysicalLocation || ""}</span
                      >
                    </div>
                    <div
                      class="flex-1 mx-2 border-t border-dashed border-gray-300 self-center"
                    ></div>
                    <div class="flex items-center">
                      <img
                        src={dropOffIcon}
                        alt="Delivery"
                        class="w-4 h-4 mr-1"
                      />
                      <span class="text-xs font-medium"
                        >{data.orderDetail?.destinationCity || "Delivery"}</span
                      >
                      <span class="ml-1 text-xs text-gray-500"
                        >{data.orderDetail?.dropOffPhysicalLocation || ""}</span
                      >
                    </div>
                  </div>
                  <!-- Distance and time if available -->
                  {#if data.orderDetail?.distanceInKm || data.orderDetail?.estimatedTimeInMinutes}
                    <div
                      class="flex justify-between mt-2 text-xs sm:text-sm text-gray-700 bg-blue-50 p-3 rounded-lg border border-blue-100"
                    >
                      <div class="flex items-center">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-4 w-4 sm:h-5 sm:w-5 mr-2 text-blue-600"
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
                        <span class="font-medium">
                          {data.orderDetail?.distanceInKm
                            ? `${data.orderDetail.distanceInKm.toFixed(1)} km`
                            : "Distance N/A"}
                        </span>
                      </div>
                      <div class="flex items-center">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-4 w-4 sm:h-5 sm:w-5 mr-2 text-blue-600"
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
                        <span class="font-medium">
                          {data.orderDetail?.estimatedTimeInMinutes
                            ? `${
                                Math.floor(
                                  data.orderDetail.estimatedTimeInMinutes / 60
                                ) > 0
                                  ? `${Math.floor(data.orderDetail.estimatedTimeInMinutes / 60)}h ${data.orderDetail.estimatedTimeInMinutes % 60}m`
                                  : `${data.orderDetail.estimatedTimeInMinutes}m`
                              }`
                            : "Time N/A"}
                        </span>
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Package Info -->
              <div class="mb-6">
                <h4 class="font-medium text-gray-700 mb-2">Package Details</h4>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <p class="text-sm text-gray-600">Package Type</p>
                    <p class="text-sm font-medium text-gray-800">
                      {packageType || "N/A"}
                    </p>
                  </div>
                  <div>
                    <p class="text-sm text-gray-600">Delivery Type</p>
                    <p class="text-sm font-medium text-gray-800">
                      {data.orderDetail?.isInCity
                        ? "In-City"
                        : "Between Cities"}
                    </p>
                  </div>
                  <div>
                    <p class="text-sm text-gray-600">Order Type</p>
                    <p class="text-sm font-medium text-gray-800">
                      {orderType}
                    </p>
                  </div>
                  <div>
                    <p class="text-sm text-gray-600">Goods Type</p>
                    <p class="text-sm font-medium text-gray-800">
                      {goodsType}
                    </p>
                  </div>
                  <div>
                    <p class="text-sm text-gray-600">Packaging</p>
                    <p class="text-sm font-medium text-gray-800">
                      {packagingType.replace("_", " ")}
                    </p>
                  </div>
                  <div>
                    <p class="text-sm text-gray-600">Weight</p>
                    <p class="text-sm font-medium text-gray-800">
                      {effectiveWeight.toFixed(2)} kg
                    </p>
                  </div>
                </div>
              </div>

              <!-- Delivery Time -->
              <div
                class="mb-6 p-4 bg-green-50 rounded-lg border border-green-100"
              >
                <div class="flex items-start">
                  <div
                    class="flex-shrink-0 w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mr-4"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-6 w-6 text-green-600"
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
                    <h4 class="font-medium text-green-800">
                      Estimated Delivery
                    </h4>
                    <p class="text-sm text-green-700 mt-1">
                      {estimatedDeliveryTime}
                    </p>
                    <p class="text-xs text-green-600 mt-1">
                      {#if orderType === "EXPRESS"}
                        Priority delivery with expedited processing
                      {:else if orderType === "SAME_DAY"}
                        Guaranteed same-day delivery
                      {:else}
                        Standard delivery timeframe
                      {/if}
                    </p>
                  </div>
                </div>
              </div>

              <!-- Price Summary -->
              <div>
                <h4 class="font-medium text-gray-700 mb-2">Price Summary</h4>
                <div class="border-t border-gray-200 pt-4">
                  <div class="flex justify-between mb-2">
                    <span class="text-xs sm:text-sm text-gray-600"
                      >Base Shipping</span
                    >
                    <span class="text-xs sm:text-sm font-medium text-gray-800">
                      ETB {formatPrice(data.orderDetail?.baseShippingCost || 0)}
                    </span>
                  </div>
                  <div class="flex justify-between mb-2">
                    <span class="text-xs sm:text-sm text-gray-600"
                      >Packaging</span
                    >
                    <span class="text-xs sm:text-sm font-medium text-gray-800">
                      ETB {formatPrice(data.orderDetail?.packagingCost || 0)}
                    </span>
                  </div>
                  {#if data.orderDetail?.totalAdditionalFees != null && data.orderDetail.totalAdditionalFees > 0}
                    <div class="flex justify-between mb-2">
                      <span class="text-xs sm:text-sm text-gray-600"
                        >Additional Fees</span
                      >
                      <span
                        class="text-xs sm:text-sm font-medium text-gray-800"
                      >
                        ETB {formatPrice(data.orderDetail.totalAdditionalFees)}
                      </span>
                    </div>
                  {/if}
                  <div class="border-t border-gray-200 pt-2 mt-2">
                    <div class="flex justify-between">
                      <span
                        class="text-sm sm:text-base font-medium text-gray-800"
                        >Total</span
                      >
                      <span
                        class="text-sm sm:text-base font-bold text-secondary"
                      >
                        ETB {formatPrice(data.orderDetail?.totalCost || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <!-- Support Button -->
        <div
          class="bg-white rounded-xl shadow-md overflow-hidden mb-6"
          in:fly={{ y: 20, duration: 500, delay: 600 }}
        >
          <div class="p-5">
            <div class="flex items-center">
              <div
                class="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-4"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-6 w-6 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                  />
                </svg>
              </div>
              <div class="flex-1">
                <h4 class="font-medium text-gray-800">Need assistance?</h4>
                <p class="text-sm text-gray-600 mt-1">
                  Our support team is available 24/7 to help with your order.
                </p>
              </div>
              <button
                on:click={contactSupport}
                class="ml-4 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg font-medium text-sm hover:bg-blue-200 transition-colors"
              >
                Contact Support
              </button>
            </div>
          </div>
        </div>

        <!-- Premium Promotion -->
        {#if !data?.session?.customerData?.premium}
          <div
            class="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl shadow-md overflow-hidden mb-6"
            in:fly={{ y: 20, duration: 500, delay: 900 }}
          >
            <div class="p-5 text-white">
              <h3 class="text-lg font-semibold mb-2">Upgrade to Premium</h3>
              <p class="text-sm mb-4">
                Get priority processing, exclusive discounts, and faster
                delivery times with our Premium membership.
              </p>
              <button
                class="px-4 py-2 bg-white text-indigo-600 rounded-lg font-medium text-sm hover:bg-gray-100 transition-colors"
              >
                Learn More
              </button>
            </div>
          </div>
        {/if}

        <!-- Payment Button Section -->
        <div class="my-8">
          {#if data.orderDetail?.paymentOption === "pay_now" && !data.orderDetail?.paymentStatus}
            <!-- Pay Now option - not yet paid -->
            <div class="space-y-3 w-full max-w-md mx-auto">
              <div class="text-center text-sm text-gray-600 mb-2">
                <span
                  class="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse mr-1"
                ></span>
                <span>Complete your payment to finalize your order</span>
              </div>

              <button
                on:click={() => (componentsOrder = 5)}
                class="w-full bg-gradient-to-r from-secondary to-secondary-dark text-white text-sm sm:text-base font-medium py-3 px-6 sm:px-8 rounded-lg shadow-md hover:shadow-lg flex items-center justify-center gap-2 hover:translate-y-[-2px] transition-all duration-200"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4 sm:h-5 sm:w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                  />
                </svg>
                Complete Payment Now
              </button>

              <div
                class="flex items-center justify-center text-xs text-gray-500 mt-2"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4 mr-1 text-gray-400"
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
                Secure payment processing
              </div>
            </div>
          {:else if data.orderDetail?.paymentOption === "pay_on_delivery"}
            <!-- Pay on delivery option -->
            <div class="flex flex-col items-center">
              <div
                class="bg-blue-100 text-blue-800 px-4 py-3 rounded-lg flex items-center gap-2 max-w-md"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span
                  >You've selected to pay on delivery. Have the exact amount
                  ready when the driver arrives.</span
                >
              </div>
            </div>
          {:else if data.orderDetail?.paymentOption === "pay_on_pickup"}
            <!-- Pay on pickup option -->
            <div class="flex flex-col items-center">
              {#if isOrderAssigned || isOrderInTransit}
                <!-- If driver is assigned, show pay now button -->
                <div class="space-y-3 w-full max-w-md mx-auto">
                  <div
                    class="bg-blue-100 text-blue-800 px-4 py-3 rounded-lg flex items-center gap-2"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-5 w-5 text-blue-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span
                      >Driver is on the way! Complete payment now for a smooth
                      pickup.</span
                    >
                  </div>

                  <button
                    on:click={() => (componentsOrder = 5)}
                    class="w-full bg-gradient-to-r from-blue-500 to-blue-700 text-white text-sm sm:text-base font-medium py-3 px-6 sm:px-8 rounded-lg shadow-md hover:shadow-lg flex items-center justify-center gap-2 hover:translate-y-[-2px] transition-all duration-200"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-4 w-4 sm:h-5 sm:w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                    Pay for Pickup Now
                  </button>
                </div>
              {:else}
                <div
                  class="bg-blue-100 text-blue-800 px-4 py-3 rounded-lg flex items-center gap-2 max-w-md"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span
                    >You've selected to pay on pickup. Payment will be available
                    once a driver is assigned.</span
                  >
                </div>
              {/if}
            </div>
          {:else if data.orderDetail?.paymentStatus}
            <div
              class="flex items-center justify-center text-green-600 font-bold gap-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Order Paid
            </div>
          {:else}
            <div class="space-y-3 w-full max-w-md mx-auto">
              <!-- Payment Button -->
              <button
                on:click={handleProceedToPayment}
                class="w-full bg-gradient-to-r from-secondary to-secondary-dark text-white font-bold py-4 px-8 rounded-lg shadow-md hover:shadow-lg flex items-center justify-center gap-2 hover:translate-y-[-2px] transition-all duration-200"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                  />
                </svg>
                Proceed to Payment
              </button>

              <!-- Payment Security Note -->
              <div
                class="flex items-center justify-center text-xs text-gray-500 mt-2"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4 mr-1 text-gray-400"
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
                Secure payment processing
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Payment (Step 5) - Show based on payment option and status -->
    {#if componentsOrder === 5 && (canProceedToPayment || data.orderDetail?.paymentOption === "pay_now")}
      <div in:fade={{ duration: 300 }}>
        <Payment
          {data}
          {form}
          {componentsOrder}
          on:back={() => (componentsOrder = 4)}
        />
      </div>
    {/if}
  </div>
</div>

<!-- Celebration animation when order is accepted -->
{#if showAcceptanceAnimation}
  <div
    class="fixed inset-0 flex items-center justify-center z-50 pointer-events-none px-4"
    in:fade={{ duration: 300 }}
    out:fade={{ duration: 500, delay: 5000 }}
  >
    <div class="relative">
      <!-- Celebration text -->
      <div
        class="text-center p-4 sm:p-8 rounded-xl bg-green-100/80 shadow-lg backdrop-blur-sm transform scale-100 animate-pulse-slow"
        in:scale={{ duration: 600, start: 0.5, opacity: 0 }}
      >
        <h2
          class="text-xl sm:text-3xl md:text-5xl font-bold text-green-600 mb-3 sm:mb-4 animate-bounce-slow"
        >
          🎉 Order Accepted! 🎉
        </h2>
        <p class="text-base sm:text-xl text-green-800 max-w-lg">
          Your order has been accepted and is now being processed!
          {#if data.orderDetail?.paymentOption === "pay_now" || data.orderDetail?.paymentOption === "pay_on_acceptance"}
            Please complete your payment to continue.
          {/if}
        </p>
      </div>
    </div>
  </div>
{/if}

<!-- Order Assigned Information - Show when order is assigned to a driver -->
{#if (isOrderAssigned || isOrderInTransit) && assignedDriver && componentsOrder === 4}
  <div
    in:fade={{ duration: 300 }}
    class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-lg overflow-hidden mb-6"
  >
    <div class="p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-blue-800">
          <span class="mr-2">🚚</span>
          Driver Assigned
        </h3>
        <span
          class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium {isOrderInTransit
            ? 'bg-purple-200 text-purple-800'
            : 'bg-blue-200 text-blue-800'}"
        >
          <span
            class="w-2 h-2 {isOrderInTransit
              ? 'bg-purple-500'
              : 'bg-blue-500'} rounded-full mr-1.5 animate-pulse"
          ></span>
          {isOrderInTransit ? "In Transit" : "On Way to Pickup"}
        </span>
      </div>

      <!-- Order flow visualization -->
      <div
        class="flex items-center justify-between mb-6 p-3 bg-white rounded-lg"
      >
        <div class="flex flex-col items-center">
          <div
            class="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
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
          <span class="text-xs text-green-800 font-medium mt-1">Accepted</span>
        </div>
        <div class="flex-1 mx-1 h-1 bg-gray-200 relative">
          <div class="absolute inset-0 bg-blue-500" style="width: 100%"></div>
        </div>
        <div class="flex flex-col items-center">
          <div
            class="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>
          <span class="text-xs text-blue-800 font-medium mt-1"
            >Driver Assigned</span
          >
        </div>
        <div class="flex-1 mx-1 h-1 bg-gray-200 relative">
          <div
            class="absolute inset-0 bg-purple-500"
            style="width: {isOrderInTransit ? '100%' : '0%'}"
          ></div>
        </div>
        <div class="flex flex-col items-center">
          <div
            class="w-8 h-8 rounded-full {isOrderInTransit
              ? 'bg-purple-500 text-white'
              : 'bg-gray-200 text-gray-400'} flex items-center justify-center"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M17 8l4 4m0 0l-4 4m4-4H3"
              />
            </svg>
          </div>
          <span
            class="text-xs {isOrderInTransit
              ? 'text-purple-800'
              : 'text-gray-500'} font-medium mt-1">In Transit</span
          >
        </div>
      </div>

      <div class="flex flex-col gap-4 sm:flex-row sm:items-center mb-4">
        <div
          class="flex-shrink-0 w-16 h-16 bg-blue-200 rounded-full flex items-center justify-center"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-8 w-8 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        </div>
        <div class="flex-grow">
          <h4 class="text-md font-semibold text-blue-900">
            {assignedDriver.userName || "Assigned Driver"}
          </h4>
          <div class="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
            <div class="flex items-center text-sm text-blue-700">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4 mr-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                />
              </svg>
              <span>{assignedDriver.phoneNumber || "N/A"}</span>
            </div>
            <div class="flex items-center text-sm text-blue-700">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4 mr-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              <span>ID: {assignedDriver.id || "N/A"}</span>
            </div>
            <div class="flex items-center text-sm text-blue-700">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4 mr-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span class="font-medium"
                >{isOrderInTransit ? "IN_TRANSIT" : "ASSIGNED"}</span
              >
            </div>
            <div class="flex items-center text-sm text-blue-700">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4 mr-1"
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
              <span>{data.orderDetail?.vehicleType || "CAR"}</span>
            </div>
          </div>
        </div>
        <div class="flex-shrink-0 ml-0 mt-3 sm:mt-0 sm:ml-4">
          <a
            href={`tel:${assignedDriver.phoneNumber}`}
            class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg
              class="-ml-1 mr-2 h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
              />
            </svg>
            Call
          </a>
        </div>
      </div>

      <!-- Status message -->
      <div
        class="p-4 {isOrderInTransit
          ? 'bg-purple-50 border-purple-100'
          : 'bg-blue-50 border-blue-100'} rounded-lg border mb-4"
      >
        <p
          class="font-medium {isOrderInTransit
            ? 'text-purple-800'
            : 'text-blue-800'}"
        >
          {#if isOrderInTransit}
            Your package is now in transit! The driver has picked up your
            package and is on the way to the delivery location.
          {:else}
            A driver has been assigned and is on the way to pick up your
            package. You'll be notified when the pickup is complete.
          {/if}
        </p>
        <p
          class="text-sm {isOrderInTransit
            ? 'text-purple-600'
            : 'text-blue-600'} mt-1"
        >
          {#if data.orderDetail?.paymentOption === "pay_on_delivery"}
            Remember to have your payment ready when the driver arrives for
            delivery.
          {:else if data.orderDetail?.paymentOption === "pay_on_pickup" && !data.orderDetail?.paymentStatus}
            Complete your payment now to ensure a smooth pickup process.
          {/if}
        </p>
      </div>

      <!-- Driver Location Map -->
      <div class="mt-5 mb-5">
        <div class="flex items-center justify-between mb-3">
          <h4
            class="text-sm font-semibold {isOrderInTransit
              ? 'text-purple-800'
              : 'text-blue-800'}"
          >
            Driver Location Tracking
          </h4>

          <div class="flex items-center">
            <span
              class="text-xs {$isConnected
                ? 'text-green-600'
                : 'text-gray-500'} mr-2 flex items-center"
            >
              <span
                class="w-2 h-2 rounded-full {$isConnected
                  ? 'bg-green-500 animate-pulse'
                  : 'bg-gray-400'} mr-1"
              ></span>
              {$isConnected ? "Connected" : "Offline"}
            </span>

            <button
              on:click={() => {
                if (data.orderDetail?.id) {
                  trackOrderDriver(data.orderDetail.id);
                  toast.push("Refreshing driver location...", {
                    duration: 2000,
                    theme: {
                      "--toastBackground": "#3B82F6",
                      "--toastColor": "white",
                    },
                  });
                }
              }}
              class="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 transition flex items-center"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-3 w-3 mr-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        <div
          class="h-[300px] rounded-lg overflow-hidden border {isOrderInTransit
            ? 'border-purple-200'
            : 'border-blue-200'} shadow-sm"
        >
          {#if driverCoordinates}
            <DriverLocationMap
              order={{
                id: data.orderDetail?.id || null,
                pickUpMapLocation: data.orderDetail?.pickUpMapLocation || null,
                dropOffMapLocation:
                  data.orderDetail?.dropOffMapLocation || null,
              }}
              driverLocation={driverCoordinates}
              {driverIsOnline}
              driverName={assignedDriver.userName || "Driver"}
            />
            <div
              class="flex items-center justify-between mt-2 text-xs text-gray-600 px-2"
            >
              <div class="flex items-center">
                <div class="w-3 h-3 bg-yellow-400 rounded-full mr-1.5"></div>
                <span>Driver Location</span>
              </div>
              <div class="flex items-center">
                <div class="w-3 h-3 bg-green-500 rounded-full mr-1.5"></div>
                <span>Pickup Location</span>
              </div>
              <div class="flex items-center">
                <div class="w-3 h-3 bg-red-500 rounded-full mr-1.5"></div>
                <span>Delivery Location</span>
              </div>
            </div>
          {:else}
            <div
              class="h-full flex flex-col items-center justify-center bg-gray-50"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-12 w-12 text-gray-400 mb-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                />
              </svg>
              <p class="text-gray-500">Waiting for driver location updates</p>
              <p class="text-xs text-gray-400 mt-1">
                Location updates appear in real-time as the driver moves
              </p>
              <button
                on:click={() => {
                  if (data.orderDetail?.id) {
                    trackOrderDriver(data.orderDetail.id);
                    toast.push("Refreshing driver data...", {
                      duration: 2000,
                      theme: {
                        "--toastBackground": "#3B82F6",
                        "--toastColor": "white",
                      },
                    });
                  }
                }}
                class="mt-3 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition"
              >
                Refresh Driver Data
              </button>
            </div>
          {/if}
        </div>
      </div>

      <!-- Order Milestones Progress -->
      {#if data.orderDetail?.orderMilestone && data.orderDetail.orderMilestone.length > 0}
        <div
          class="mt-5 pt-5 border-t {isOrderInTransit
            ? 'border-purple-200'
            : 'border-blue-200'}"
        >
          <h4
            class="text-sm font-semibold {isOrderInTransit
              ? 'text-purple-800'
              : 'text-blue-800'} mb-3"
          >
            Order Progress
          </h4>
          <div class="space-y-3">
            {#each data.orderDetail.orderMilestone
              .filter((m) => m.isCompleted)
              .slice(0, 3) as milestone}
              <div class="flex items-start">
                <div
                  class="flex-shrink-0 h-5 w-5 rounded-full bg-green-500 flex items-center justify-center mr-3"
                >
                  <svg
                    class="h-3 w-3 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="3"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <div>
                  <p
                    class="text-sm {isOrderInTransit
                      ? 'text-purple-700'
                      : 'text-blue-700'}"
                  >
                    {milestone.description}
                  </p>
                  <p
                    class="text-xs {isOrderInTransit
                      ? 'text-purple-500'
                      : 'text-blue-500'}"
                  >
                    {dayjs(milestone.createdAt).format("MMM D, h:mm A")}
                  </p>
                </div>
              </div>
            {/each}

            {#if activeOrderDispatch}
              <div class="flex items-start">
                <div
                  class="h-5 w-5 rounded-full border-2 {isOrderInTransit
                    ? 'border-purple-500'
                    : 'border-blue-500'} flex items-center justify-center mr-3 animate-pulse"
                >
                  <div
                    class="h-2 w-2 rounded-full {isOrderInTransit
                      ? 'bg-purple-500'
                      : 'bg-blue-500'}"
                  ></div>
                </div>
                <div>
                  <p
                    class="text-sm {isOrderInTransit
                      ? 'text-purple-700'
                      : 'text-blue-700'}"
                  >
                    {isOrderInTransit
                      ? "Driver is in transit with your package"
                      : "Driver on way to pickup location"}
                  </p>
                  <p
                    class="text-xs {isOrderInTransit
                      ? 'text-purple-500'
                      : 'text-blue-500'}"
                  >
                    {dayjs(activeOrderDispatch.createdAt).fromNow()}
                  </p>
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Payment Call-to-Action when driver assigned and payment eligible -->
      {#if canProceedToPayment && data.orderDetail?.paymentOption === "pay_on_pickup"}
        <div
          class="mt-5 pt-5 border-t {isOrderInTransit
            ? 'border-purple-200'
            : 'border-blue-200'} flex flex-col items-center"
        >
          <p
            class="text-sm {isOrderInTransit
              ? 'text-purple-700'
              : 'text-blue-700'} mb-3 text-center"
          >
            Your driver is on the way! Complete payment now to ensure a smooth
            pickup process.
          </p>
          <button
            on:click={handleProceedToPayment}
            class="w-full sm:w-auto inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-white {isOrderInTransit
              ? 'bg-purple-600 hover:bg-purple-700 focus:ring-purple-500'
              : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'} focus:outline-none focus:ring-2 focus:ring-offset-2"
          >
            <svg
              class="-ml-1 mr-2 h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            Pay for Pickup Now
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- Payment section updates -->
<!-- Update the payment options section -->
{#if data.orderDetail?.paymentOption === "pay_on_delivery" && componentsOrder === 4}
  <div
    class="bg-yellow-50 border border-yellow-200 rounded-xl p-5 my-6 flex items-start space-x-4"
  >
    <div class="flex-shrink-0">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-6 w-6 text-yellow-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </div>
    <div>
      <h3 class="text-md font-semibold text-yellow-800">Cash on Delivery</h3>
      <p class="text-sm text-yellow-700 mt-1">
        You've selected to pay on delivery. Have the exact amount of ETB {formatPrice(
          data.orderDetail?.totalCost || 0
        )} ready when the driver delivers your package.
      </p>
    </div>
  </div>
{/if}

<style>
  /* Custom animations for celebration effects */
  @keyframes pulse-slow {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.9;
      transform: scale(1.05);
    }
  }

  @keyframes bounce-slow {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-10px);
    }
  }

  .animate-pulse-slow {
    animation: pulse-slow 3s ease-in-out infinite;
  }

  .animate-bounce-slow {
    animation: bounce-slow 2s ease-in-out infinite;
  }
</style>
