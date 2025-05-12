<script lang="ts">
  import { page } from "$app/stores";
  import DriverLocationMap from "$lib/components/driver-location.map.svelte";
  import StarRating from "$lib/components/star-rating.svelte";
  import { clickOutside } from "$lib/utils/click-outside.js";
  import { toast } from "@zerodevx/svelte-toast";
  import dayjs from "dayjs";
  import { fly, fade, scale } from "svelte/transition";
  import { quintOut, elasticOut } from "svelte/easing";
  import { onMount, onDestroy } from "svelte";
  // import Barcode from "svelte-barcode";
  import { superForm } from "sveltekit-superforms/client";
  import { enhance } from "$app/forms";
  import type { Order_orderStatus } from "@prisma/client";
  import {
    subscribeToOrder,
    initSocket,
    isConnected,
  } from "$lib/socket/client.js";
  import {
    initDriverTracking,
    trackOrderDriver,
    driverLocations,
    onlineDrivers,
  } from "$lib/socket/driver-tracking";
  import { browser } from "$app/environment";

  export let data;
  export let form;

  let [mapLat, mapLng] = data.orderDetail?.pickUpMapLocation.split(",") || [];
  let [destinationLat, destinationLng] =
    data.orderDetail?.dropOffMapLocation.split(",") || [];
  let [deliveryLat, deliveryLng] =
    data.orderDetail?.Tracker?.mapLocation.split(",") || [];

  // Driver tracking state
  let driverCoordinates: string | null = null;
  let driverIsOnline = false;

  let orderRateModal = false;
  let driverRateModal = false;
  let ratingOrder: number | null = null;
  let ratingDriver: number | null = null;
  let pageLoaded = true; // Set to true by default for better UX

  // Determine if order is completed and can be rated
  $: isOrderCompleted =
    data.orderDetail?.orderStatus === ORDER_STATUS.COMPLETED;

  // Determine if order is claimed by a warehouse
  $: isOrderClaimed = data.orderDetail?.orderStatus === ORDER_STATUS.ACCEPTED;

  // Determine if order is unclaimed and awaiting warehouse acceptance
  $: isOrderUnclaimed =
    data.orderDetail?.orderStatus === ORDER_STATUS.BEING_REVIEWED;

  // Determine if order is cancelled
  $: isOrderCancelled =
    data.orderDetail?.orderStatus === ORDER_STATUS.CANCELLED;

  // Determine payment status
  $: isOrderPaid = data.orderDetail?.paymentStatus === true;

  // Determine payment option
  $: paymentOption = data.orderDetail?.paymentOption || "pay_on_acceptance";

  // Determine if this is a pay on delivery order
  $: isPayOnDelivery = paymentOption === "pay_on_delivery";

  // Determine if order is in transit or assigned
  $: isOrderInTransit =
    data.orderDetail?.orderStatus === ORDER_STATUS.IN_TRANSIT;
  $: isOrderAssigned = data.orderDetail?.orderStatus === ORDER_STATUS.ASSIGNED;

  // Get assigned driver info
  $: assignedDriver =
    data.orderDetail?.Dispatch?.AssignedEmployee?.User ||
    data.orderDetail?.Dispatch?.AssignedVendorDriver?.User;

  let showCancellationModal = false;
  let cancellationReason = "";
  let isSubmittingCancellation = false;

  // Helper function to check if the order can be cancelled
  function canCancelOrder() {
    return (
      data.orderDetail?.orderStatus === ORDER_STATUS.BEING_REVIEWED ||
      data.orderDetail?.orderStatus === ORDER_STATUS.WAITING
    );
  }

  function openCancellationModal() {
    showCancellationModal = true;
  }

  function closeCancellationModal() {
    showCancellationModal = false;
    cancellationReason = "";
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

  // Helper function to get order status label with color
  function getOrderStatusDetails() {
    // No need to convert status now
    const status = data.orderDetail?.orderStatus;

    switch (status) {
      case ORDER_STATUS.BEING_REVIEWED:
        return {
          label: "Being Reviewed",
          message: "Your order is currently being reviewed by our team.",
          color: "text-yellow-600 bg-yellow-100",
          icon: "time",
        };
      case ORDER_STATUS.ASSIGNED:
        return {
          label: "Assigned",
          message: "Your order has been assigned to a courier.",
          color: "text-blue-600 bg-blue-100",
          icon: "truck",
        };
      case ORDER_STATUS.WAITING:
        return {
          label: "Waiting",
          message: "Your order is waiting to be picked up.",
          color: "text-indigo-600 bg-indigo-100",
          icon: "time",
        };
      case ORDER_STATUS.ACCEPTED:
        return {
          label: "Accepted",
          message: "Your order has been accepted and is being processed.",
          color: "text-green-600 bg-green-100",
          icon: "check-circle",
        };
      case ORDER_STATUS.IN_TRANSIT:
        return {
          label: "In Transit",
          message: "Your package is on its way to the destination.",
          color: "text-blue-600 bg-blue-100",
          icon: "truck",
        };
      case ORDER_STATUS.SHIPPED:
        return {
          label: "Shipped",
          message: "Your package has been shipped and is on its way.",
          color: "text-blue-600 bg-blue-100",
          icon: "truck",
        };
      case ORDER_STATUS.COMPLETED:
        return {
          label: "Completed",
          message: "Your order has been successfully delivered.",
          color: "text-green-600 bg-green-100",
          icon: "check-circle",
        };
      case ORDER_STATUS.CANCELLED:
        return {
          label: "Cancelled",
          message: "This order has been cancelled.",
          color: "text-red-600 bg-red-100",
          icon: "x-circle",
        };
      case ORDER_STATUS.RETURNED:
        return {
          label: "Returned",
          message: "This package has been returned to sender.",
          color: "text-orange-600 bg-orange-100",
          icon: "x-circle",
        };
      default:
        return {
          label: status || "Unknown",
          message: "Status information not available.",
          color: "text-gray-600 bg-gray-100",
          icon: "question",
        };
    }
  }

  // Check if the current user has already rated this order
  $: hasUserRatedOrder = checkIfUserRatedOrder();

  // Get list of eligible drivers (those who have completed milestones)
  $: eligibleDrivers = getEligibleDrivers();

  // Get drivers that haven't been rated by this user yet
  $: unratedDrivers = getUnratedDrivers();

  // Get rated drivers with their ratings
  $: ratedDrivers = getRatedDrivers();

  function checkIfUserRatedOrder() {
    if (!data.orderDetail?.OrderRating || !$page.data.session?.customerData.id)
      return false;

    return data.orderDetail.OrderRating.some(
      (rating) => rating?.Customer?.id === $page.data.session?.customerData.id
    );
  }

  function getEligibleDrivers() {
    if (!data.orderDetail?.OrderDispatch) return [];

    // If order is completed, all drivers are eligible
    if (isOrderCompleted) {
      return data.orderDetail.OrderDispatch.filter(
        (dispatch) =>
          // Only include dispatches that have an assigned driver
          !!(
            dispatch.Dispatch.AssignedEmployee?.User.id ||
            dispatch.Dispatch.AssignedVendorDriver?.User.id
          )
      );
    }

    // Otherwise, only drivers with completed dispatch status are eligible
    return data.orderDetail.OrderDispatch.filter(
      (ds) =>
        ds.dispatchStatus === "COMPLETED" &&
        // Only include dispatches that have an assigned driver
        !!(
          ds.Dispatch.AssignedEmployee?.User.id ||
          ds.Dispatch.AssignedVendorDriver?.User.id
        )
    );
  }

  function getUnratedDrivers() {
    if (!eligibleDrivers.length || !$page.data.session?.customerData.id)
      return [];

    console.log("Eligible drivers:", eligibleDrivers);
    if (data.orderDetail.DriverRating) {
      console.log("Existing driver ratings:", data.orderDetail.DriverRating);
    }

    // Filter out drivers that have already been rated by this user
    const unrated = eligibleDrivers.filter((dispatch) => {
      const driverId =
        dispatch.Dispatch.AssignedEmployee?.User.id ??
        dispatch.Dispatch.AssignedVendorDriver?.User.id;

      // If there are no driver ratings or no driver ID, include it
      if (!data.orderDetail.DriverRating?.length || !driverId) return true;

      // Check if this driver has been rated by this user for this order
      const isRated = data.orderDetail.DriverRating.some((rating) => {
        // Ensure both userId and driverId are defined
        if (!rating?.userId || !driverId) return false;

        // Check if the current customer has rated this specific driver
        const matchesUserId = String(rating.userId) === String(driverId);
        const matchesCustomer =
          rating.Customer?.id === $page.data.session?.customerData.id;

        console.log(
          `Comparing rating.userId ${rating.userId} with driverId ${driverId}: ${matchesUserId}`
        );
        console.log(`Matching customer: ${matchesCustomer}`);

        return matchesUserId && matchesCustomer;
      });

      console.log(
        `Driver ${driverId} (${dispatch.Dispatch.AssignedEmployee?.User.userName ?? dispatch.Dispatch.AssignedVendorDriver?.User.userName}) rated: ${isRated}`
      );

      return !isRated;
    });

    console.log("Unrated drivers:", unrated);
    return unrated;
  }

  function getRatedDrivers() {
    if (!data.orderDetail?.DriverRating || !$page.data.session?.customerData.id)
      return [];

    // Get drivers that have been rated by this user
    return data.orderDetail.DriverRating.filter(
      (rating) => rating.Customer?.id === $page.data.session?.customerData.id
    );
  }

  // Add tracking variables and setup polling mechanism
  let driverLocationPolling: ReturnType<typeof setInterval> | null = null;
  let socketInitialized = false;

  // Update onMount function to properly initialize tracking
  onMount(() => {
    // Additional setup can be done here
    pageLoaded = true;

    if (browser && data.orderDetail?.id && !socketInitialized) {
      socketInitialized = true;
      console.log(`Initializing socket for order: ${data.orderDetail.id}`);

      // Initialize socket connection first
      initSocket()
        .then(() => {
          // Initialize driver tracking
          initDriverTracking();

          // Subscribe to this specific order for updates
          subscribeToOrder(data.orderDetail?.id);

          // Start tracking the driver for this order
          trackOrderDriver(data.orderDetail.id);

          // Setup fallback polling for driver location
          setupDriverPolling();

          toast.push("Live driver tracking activated", {
            duration: 3000,
            theme: {
              "--toastBackground": "#3B82F6",
              "--toastColor": "white",
            },
          });
        })
        .catch((error) => {
          console.error("Socket initialization failed:", error);
          // Still setup fallback polling if socket fails
          setupDriverPolling();

          toast.push("Using fallback location updates", {
            duration: 3000,
            theme: {
              "--toastBackground": "#F97316",
              "--toastColor": "white",
            },
          });
        });
    }
  });

  // Add a function to set up polling as fallback for sockets
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

  // Add onDestroy to clean up timers and event listeners
  onDestroy(() => {
    // Clear driver location polling
    if (driverLocationPolling) {
      clearInterval(driverLocationPolling);
    }
  });

  $: form?.createOrderRating
    ? toast.push("Thank you for your valuable feedback!")
    : null;
  $: form?.createOrderRating ? (orderRateModal = false) : null;

  $: form?.createDriverRating
    ? toast.push("Your rating has been recorded. We appreciate your feedback!")
    : null;
  $: form?.createDriverRating ? (driverRateModal = false) : null;

  const {
    form: addOrderRatingForm,
    enhance: addOrderRatingEnhance,
    allErrors: addOrderRatingErrors,
    constraints: addOrderRatingConstraints,
  } = superForm(data.addOrderRatingForm, {
    onSubmit({ formData, cancel }) {
      if (!ratingOrder) {
        toast.push("Please rate the service");
        cancel();
      }
      if (!$page.data.session?.customerData.id) {
        toast.push("Please login to rate the service.");
        cancel();
      }
      // Check if user has already rated
      if (hasUserRatedOrder) {
        toast.push("You have already rated this service");
        cancel();
      }
      formData.set("rating", ratingOrder ? ratingOrder.toString() : "");
      formData.set(
        "customerId",
        JSON.stringify($page.data.session?.customerData.id)
      );
    },
  });

  const {
    form: addDriverRatingForm,
    enhance: addDriverRatingEnhance,
    allErrors: addDriverRatingErrors,
    constraints: addDriverRatingConstraints,
  } = superForm(data.addDriverRatingForm, {
    onSubmit({ formData, cancel }) {
      if (!ratingDriver) {
        toast.push("Please rate the driver.");
        cancel();
      }
      if (!$page.data.session?.customerData.id) {
        toast.push("Please login to rate the service");
        cancel();
      }

      // Check if selected driver has already been rated by this user
      const selectedDriverId = formData.get("driverUserId");
      console.log("Submitting rating for driver:", selectedDriverId);

      if (selectedDriverId && data.orderDetail.DriverRating?.length) {
        const alreadyRated = data.orderDetail.DriverRating.some((rating) => {
          if (!rating?.userId || !selectedDriverId) return false;

          const matchesUserId =
            String(rating.userId) === String(selectedDriverId);
          const matchesCustomer =
            rating.Customer?.id === $page.data.session?.customerData.id;

          console.log(
            `Form validation - Comparing rating.userId ${rating.userId} with selectedDriverId ${selectedDriverId}: ${matchesUserId}`
          );
          console.log(
            `Form validation - Matching customer: ${matchesCustomer}`
          );

          return matchesUserId && matchesCustomer;
        });

        if (alreadyRated) {
          console.log(
            "Preventing duplicate rating for driver:",
            selectedDriverId
          );
          toast.push("You have already rated this driver");
          cancel();
        }
      }

      formData.set("rating", ratingDriver ? ratingDriver.toString() : "");
      formData.set(
        "customerId",
        JSON.stringify($page.data.session?.customerData.id)
      );
    },
  });

  function getStatusColor(status: string | undefined | null): string {
    switch (status?.toLowerCase()) {
      case "completed":
        return "bg-emerald-500";
      case "in progress":
      case "inprogress":
      case "claimed":
        return "bg-amber-500";
      case "pending":
      case "unclaimed":
        return "bg-blue-500";
      case "cancelled":
        return "bg-red-500";
      default:
        return "bg-secondary";
    }
  }

  // Type-safe order status constants
  const ORDER_STATUS = {
    BEING_REVIEWED: "BEING_REVIEWED" as Order_orderStatus,
    WAITING: "WAITING" as Order_orderStatus,
    ACCEPTED: "ACCEPTED" as Order_orderStatus,
    CANCELLED: "CANCELLED" as Order_orderStatus,
    COMPLETED: "COMPLETED" as Order_orderStatus,
    IN_TRANSIT: "IN_TRANSIT" as Order_orderStatus,
    RETURNED: "RETURNED" as Order_orderStatus,
    SHIPPED: "SHIPPED" as Order_orderStatus,
    ASSIGNED: "ASSIGNED" as Order_orderStatus,
  };
</script>

{#if pageLoaded}
  <div
    class="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 pt-6 pb-20"
    in:fade={{ duration: 800, delay: 100 }}
  >
    <div class="max-w-3xl mx-auto px-5">
      <!-- Order Header -->
      <div
        class="flex flex-col items-center mb-10"
        in:fly={{ y: -20, duration: 700, delay: 200 }}
      >
        <div
          class="w-20 h-20 flex items-center justify-center bg-primary rounded-full mb-4 shadow-lg"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-10 w-10 text-white"
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
        </div>
        <h1 class="text-3xl font-bold text-gray-800 tracking-tight">
          Your Exclusive Delivery
        </h1>
        <p class="text-gray-500 mt-1 text-center max-w-md">
          Order #{data.orderDetail?.id
            ? data.orderDetail.id.toString().substring(0, 8)
            : ""}
        </p>

        <!-- Enhanced Order Status Display -->
        {#if data.orderDetail}
          {@const statusDetails = getOrderStatusDetails()}
          <div
            class="w-full max-w-lg mt-6 rounded-xl overflow-hidden shadow-md transition-all duration-300 transform hover:shadow-lg"
            in:fly={{ y: 20, duration: 700, delay: 400 }}
          >
            <div class="p-5 border-b border-gray-100">
              <div class="flex items-center justify-between">
                <div class="flex items-center">
                  <div class="flex-shrink-0">
                    <span
                      class="inline-flex items-center justify-center h-10 w-10 rounded-full {statusDetails.color.split(
                        ' '
                      )[0]}"
                    >
                      {#if statusDetails.icon === "check-circle"}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-6 w-6"
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
                      {:else if statusDetails.icon === "x-circle"}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-6 w-6"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      {:else if statusDetails.icon === "truck"}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-6 w-6"
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
                      {:else}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-6 w-6"
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
                      {/if}
                    </span>
                  </div>
                  <div class="ml-4">
                    <h3 class="text-lg font-semibold text-gray-900">
                      Order Status: <span class={statusDetails.color}
                        >{statusDetails.label}</span
                      >
                    </h3>
                    <p class="text-sm text-gray-600">{statusDetails.message}</p>
                  </div>
                </div>
              </div>

              <!-- Payment Status Section -->
              <div class="mt-4 pt-3 border-t border-gray-100">
                <div class="flex justify-between items-center">
                  <div class="flex items-center space-x-2">
                    {#if isOrderPaid}
                      <div class="bg-green-100 p-1 rounded-full">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-4 w-4 text-green-600"
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
                      </div>
                      <span class="text-sm font-medium text-green-600"
                        >Payment Confirmed</span
                      >
                    {:else if isPayOnDelivery}
                      <div class="bg-blue-100 p-1 rounded-full">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-4 w-4 text-blue-600"
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
                      </div>
                      <span class="text-sm font-medium text-blue-600"
                        >Pay on Delivery</span
                      >
                    {:else}
                      <div class="bg-yellow-100 p-1 rounded-full">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-4 w-4 text-yellow-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </div>
                      <span class="text-sm font-medium text-yellow-600"
                        >Payment Required</span
                      >
                    {/if}
                  </div>

                  <div class="flex space-x-2">
                    {#if data.orderDetail?.orderStatus === ORDER_STATUS.BEING_REVIEWED}
                      <!-- Add Cancel Button -->
                      <button
                        on:click={() => {
                          showCancellationModal = true;
                        }}
                        class="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-150"
                      >
                        Cancel Order
                      </button>
                    {/if}

                    {#if !isOrderPaid && !isPayOnDelivery && !isOrderCancelled}
                      <a
                        href="/finalize-order/{data.orderDetail.id}"
                        class="px-4 py-2 text-sm font-medium text-white bg-secondary rounded-lg hover:bg-secondary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary transition-colors duration-150"
                      >
                        Make Payment
                      </a>
                    {/if}
                  </div>
                </div>
              </div>
            </div>

            <!-- Order Timeline / Next Steps -->
            <div class="p-5 bg-gray-50">
              {#if isOrderCompleted}
                <div class="flex items-center text-green-600">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5 mr-2"
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
                  <p class="text-sm font-medium">
                    Your delivery has been completed successfully!
                  </p>
                </div>
              {:else if isOrderCancelled}
                <!-- No timeline for cancelled orders -->
              {:else if isOrderClaimed}
                <div class="text-sm text-gray-700">
                  <div class="font-medium mb-2">Next Steps:</div>
                  <ul class="space-y-2 relative">
                    <!-- Add vertical progress line that connects the steps -->
                    <div
                      class="absolute left-2.5 top-5 h-[calc(100%-20px)] w-0.5 bg-gray-200"
                    ></div>
                    <!-- Add progress line overlay to show completed progress -->
                    <div
                      class="absolute left-2.5 top-5 w-0.5 bg-secondary"
                      style="height: 20px; transition: height 0.5s ease;"
                    ></div>

                    {#if !isOrderPaid && !isPayOnDelivery}
                      <li class="flex items-start relative z-10">
                        <div class="flex-shrink-0 h-5 w-5 relative mt-1">
                          <div
                            class="absolute inset-0 rounded-full bg-secondary/20 animate-ping"
                          ></div>
                          <div
                            class="relative rounded-full h-5 w-5 bg-secondary flex items-center justify-center"
                          >
                            <span class="text-white text-xs">1</span>
                          </div>
                        </div>
                        <p class="ml-3 text-secondary font-medium">
                          Complete your payment to proceed with delivery
                        </p>
                      </li>
                      <li class="flex items-start opacity-50 relative z-10">
                        <div class="flex-shrink-0 h-5 w-5 relative mt-1">
                          <div
                            class="relative rounded-full h-5 w-5 bg-gray-300 flex items-center justify-center"
                          >
                            <span class="text-white text-xs">2</span>
                          </div>
                        </div>
                        <p class="ml-3">Warehouse will prepare your package</p>
                      </li>
                    {:else}
                      <li class="flex items-start relative z-10">
                        <div class="flex-shrink-0 h-5 w-5 relative mt-1">
                          <div
                            class="absolute inset-0 rounded-full bg-secondary/20 animate-ping"
                          ></div>
                          <div
                            class="relative rounded-full h-5 w-5 bg-secondary flex items-center justify-center"
                          >
                            <span class="text-white text-xs">1</span>
                          </div>
                        </div>
                        <p class="ml-3 text-secondary font-medium">
                          Warehouse is preparing your package
                        </p>
                      </li>
                    {/if}
                    <li class="flex items-start opacity-50 relative z-10">
                      <div class="flex-shrink-0 h-5 w-5 relative mt-1">
                        <div
                          class="relative rounded-full h-5 w-5 bg-gray-300 flex items-center justify-center"
                        >
                          <span class="text-white text-xs"
                            >{!isOrderPaid && !isPayOnDelivery
                              ? "3"
                              : "2"}</span
                          >
                        </div>
                      </div>
                      <p class="ml-3">Driver will pick up your package</p>
                    </li>
                    <li class="flex items-start opacity-50 relative z-10">
                      <div class="flex-shrink-0 h-5 w-5 relative mt-1">
                        <div
                          class="relative rounded-full h-5 w-5 bg-gray-300 flex items-center justify-center"
                        >
                          <span class="text-white text-xs"
                            >{!isOrderPaid && !isPayOnDelivery
                              ? "4"
                              : "3"}</span
                          >
                        </div>
                      </div>
                      <p class="ml-3">
                        Package will be delivered to your destination
                      </p>
                    </li>
                  </ul>
                </div>
              {:else if isOrderUnclaimed}
                <div class="text-sm text-gray-700">
                  <div class="font-medium mb-2">Next Steps:</div>
                  <ul class="space-y-2 relative">
                    <!-- Add vertical progress line that connects the steps -->
                    <div
                      class="absolute left-2.5 top-5 h-[calc(100%-20px)] w-0.5 bg-gray-200"
                    ></div>

                    <li class="flex items-start relative z-10">
                      <div class="flex-shrink-0 h-5 w-5 relative mt-1">
                        <div
                          class="absolute inset-0 rounded-full bg-secondary/20 animate-ping"
                        ></div>
                        <div
                          class="relative rounded-full h-5 w-5 bg-secondary flex items-center justify-center"
                        >
                          <span class="text-white text-xs">1</span>
                        </div>
                      </div>
                      <p class="ml-3 text-secondary font-medium">
                        Awaiting warehouse acceptance
                      </p>
                    </li>
                    {#if !isOrderPaid && !isPayOnDelivery}
                      <li class="flex items-start opacity-50 relative z-10">
                        <div class="flex-shrink-0 h-5 w-5 relative mt-1">
                          <div
                            class="relative rounded-full h-5 w-5 bg-gray-300 flex items-center justify-center"
                          >
                            <span class="text-white text-xs">2</span>
                          </div>
                        </div>
                        <p class="ml-3">Complete payment after acceptance</p>
                      </li>
                    {/if}
                    <li class="flex items-start opacity-50 relative z-10">
                      <div class="flex-shrink-0 h-5 w-5 relative mt-1">
                        <div
                          class="relative rounded-full h-5 w-5 bg-gray-300 flex items-center justify-center"
                        >
                          <span class="text-white text-xs"
                            >{!isOrderPaid && !isPayOnDelivery
                              ? "3"
                              : "2"}</span
                          >
                        </div>
                      </div>
                      <p class="ml-3">Warehouse will prepare your package</p>
                    </li>
                    <li class="flex items-start opacity-50 relative z-10">
                      <div class="flex-shrink-0 h-5 w-5 relative mt-1">
                        <div
                          class="relative rounded-full h-5 w-5 bg-gray-300 flex items-center justify-center"
                        >
                          <span class="text-white text-xs"
                            >{!isOrderPaid && !isPayOnDelivery
                              ? "4"
                              : "3"}</span
                          >
                        </div>
                      </div>
                      <p class="ml-3">Driver will deliver your package</p>
                    </li>
                  </ul>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <div
          class="mt-4 px-4 py-1.5 rounded-full shadow-sm {getStatusColor(
            data.orderDetail?.orderStatus
          )}"
          in:scale={{ duration: 400, delay: 600, start: 0.8, opacity: 0 }}
        >
          <span class="text-white font-medium tracking-wide px-2"
            >{data.orderDetail?.orderStatus}</span
          >
        </div>

        <!-- Security Information -->
        <div
          class="flex flex-wrap justify-center gap-3 mt-6 max-w-md mx-auto"
          in:fly={{ y: 20, duration: 500, delay: 600 }}
        >
          <div
            class="flex items-center space-x-2 bg-gray-50 px-3 py-2 rounded-full shadow-sm"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4 text-gray-600"
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
            <span class="text-xs font-medium text-gray-700"
              >Secure Delivery</span
            >
          </div>

          <div
            class="flex items-center space-x-2 bg-gray-50 px-3 py-2 rounded-full shadow-sm"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4 text-gray-600"
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
            <span class="text-xs font-medium text-gray-700">Order Tracking</span
            >
          </div>

          <div
            class="flex items-center space-x-2 bg-gray-50 px-3 py-2 rounded-full shadow-sm"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4 text-gray-600"
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
            <span class="text-xs font-medium text-gray-700"
              >Real-time Updates</span
            >
          </div>
        </div>

        {#if isOrderUnclaimed && !isOrderPaid && !isPayOnDelivery}
          <!-- Urgency and Social Proof for Pending Orders -->
          <div
            class="mt-6 max-w-md mx-auto bg-gradient-to-r from-orange-50 to-yellow-50 rounded-lg p-4 shadow-sm border border-yellow-100"
            in:fly={{ y: 20, duration: 500, delay: 700 }}
          >
            <div class="flex items-start">
              <div class="flex-shrink-0">
                <div class="bg-orange-100 p-2 rounded-full">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5 text-orange-500"
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
                </div>
              </div>
              <div class="ml-3">
                <h4 class="text-sm font-medium text-orange-800">
                  Speed Up Your Delivery!
                </h4>
                <p class="text-xs text-orange-700 mt-1">
                  Orders with early payment get processed 2x faster. Pay now and
                  move to the front of the processing queue!
                </p>
                <div class="mt-3">
                  <div class="flex items-center text-xs">
                    <div
                      class="relative h-1 w-full bg-gray-200 rounded-full overflow-hidden"
                    >
                      <div
                        class="absolute inset-y-0 left-0 bg-orange-400 w-3/4 rounded-full"
                      ></div>
                    </div>
                    <span class="ml-2 text-orange-800 font-medium">75%</span>
                  </div>
                  <p class="text-xs text-orange-600 mt-1">
                    Warehouse capacity is filling up quickly
                  </p>
                </div>
                <div class="mt-2 flex">
                  <a
                    href="/finalize-order/{data.orderDetail?.id}"
                    class="text-xs font-medium text-white bg-orange-500 px-3 py-1.5 rounded hover:bg-orange-600 transition-colors flex items-center"
                  >
                    Pay Now
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-3.5 w-3.5 ml-1"
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
                  </a>
                </div>
              </div>
            </div>
          </div>
        {/if}

        {#if isOrderClaimed && !isOrderPaid && !isPayOnDelivery}
          <!-- Social Proof for Claimed Orders -->
          <div
            class="mt-6 max-w-md mx-auto bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 shadow-sm border border-blue-100"
            in:fly={{ y: 20, duration: 500, delay: 700 }}
          >
            <div class="flex items-start">
              <div class="flex-shrink-0">
                <div class="bg-blue-100 p-2 rounded-full">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5 text-blue-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              </div>
              <div class="ml-3">
                <h4 class="text-sm font-medium text-blue-800">
                  Great News! Your Order is Accepted
                </h4>
                <p class="text-xs text-blue-700 mt-1">
                  95% of customers complete payment within 1 hour of acceptance
                  to ensure fastest delivery.
                </p>
                <div class="mt-2 flex items-center">
                  <div class="flex -space-x-2">
                    {#each Array(4) as _, i}
                      <div
                        class="w-6 h-6 rounded-full bg-gradient-to-br from-blue-200 to-blue-300 border border-white flex items-center justify-center text-xs text-blue-600 font-medium"
                      >
                        {["JD", "AM", "SK", "RT"][i]}
                      </div>
                    {/each}
                  </div>
                  <span class="ml-2 text-xs text-blue-600"
                    >4 people paid in the last hour</span
                  >
                </div>
                <div class="mt-2 flex">
                  <a
                    href="/finalize-order/{data.orderDetail?.id}"
                    class="text-xs font-medium text-white bg-blue-500 px-3 py-1.5 rounded hover:bg-blue-600 transition-colors flex items-center"
                  >
                    Complete Payment
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-3.5 w-3.5 ml-1"
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
                  </a>
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Rating Buttons -->
      <div
        class="grid grid-cols-2 gap-4 mb-10"
        in:fly={{ y: 20, duration: 500, delay: 300 }}
      >
        <!-- Rate Service Button - only show if order is completed and not yet rated -->
        {#if isOrderCompleted && !hasUserRatedOrder}
          <button
            on:click={() => (orderRateModal = true)}
            class="flex items-center justify-center space-x-2 bg-gradient-to-r from-complementary to-complementary/90 text-white py-3 px-4 rounded-xl shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-300"
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
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
            <span>Rate Service</span>
          </button>
        {:else if hasUserRatedOrder}
          <div
            class="flex items-center justify-center space-x-2 bg-green-100 text-green-700 py-3 px-4 rounded-xl cursor-default"
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
            <span>Service Rated</span>
          </div>
        {:else}
          <div
            class="flex items-center justify-center space-x-2 bg-gray-300 text-gray-600 py-3 px-4 rounded-xl cursor-not-allowed"
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
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
            <span>Service Rating Available After Delivery</span>
          </div>
        {/if}

        <!-- Rate Courier Button - only show if there are unrated eligible drivers -->
        {#if unratedDrivers.length > 0}
          <button
            on:click={() => (driverRateModal = true)}
            class="flex items-center justify-center space-x-2 bg-gradient-to-r from-secondary/90 to-secondary text-white py-3 px-4 rounded-xl shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-300"
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
            <span>Rate Courier</span>
          </button>
        {:else if ratedDrivers.length > 0 && eligibleDrivers.length === 0}
          <div
            class="flex items-center justify-center space-x-2 bg-green-100 text-green-700 py-3 px-4 rounded-xl cursor-default"
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
            <span>All Couriers Rated</span>
          </div>
        {:else}
          <div
            class="flex items-center justify-center space-x-2 bg-gray-300 text-gray-600 py-3 px-4 rounded-xl cursor-not-allowed"
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
            <span>Courier Rating Available After Delivery</span>
          </div>
        {/if}
      </div>

      <!-- Map Card -->
      <div
        class="bg-white rounded-2xl overflow-hidden shadow-xl mb-8 transform transition-all duration-500 hover:shadow-2xl"
        in:fly={{ y: 20, duration: 700, delay: 400 }}
      >
        <div
          class="p-6 bg-gradient-to-r from-primary/10 to-primary/5 border-b border-gray-100"
        >
          <h2 class="text-2xl font-bold text-primary">Delivery Journey</h2>
          <p class="text-gray-500 mt-1">
            Real-time tracking of your premium delivery
          </p>
        </div>
        <div
          class="bg-white p-2 rounded-lg m-4 shadow-inner overflow-hidden h-[300px]"
        >
          <!-- Replace Google Maps with DriverLocationMap component -->
          {#key [data.orderDetail?.id, driverCoordinates]}
            <DriverLocationMap
              order={{
                id: data.orderDetail?.id || null,
                pickUpMapLocation: data.orderDetail?.pickUpMapLocation || null,
                dropOffMapLocation:
                  data.orderDetail?.dropOffMapLocation || null,
              }}
              driverLocation={data.orderDetail?.Tracker?.mapLocation ||
                driverCoordinates}
              {driverIsOnline}
              driverName={assignedDriver?.userName || "Driver"}
            />
          {/key}
        </div>
        <div class="p-6 space-y-4">
          <!-- Delivery Details -->
          <div class="flex items-start space-x-3 pb-4">
            <div class="flex-shrink-0 mt-1">
              <div
                class="w-10 h-10 rounded-full bg-tertiary/20 flex items-center justify-center"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5 text-tertiary"
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
            </div>
            <div>
              <h3 class="font-semibold text-lg text-tertiary">Recipient</h3>
              <p class="text-gray-700 font-medium">
                {data.orderDetail?.receiverName
                  ? data.orderDetail?.receiverName
                  : data.orderDetail?.Receiver?.User.userName || ""}
              </p>
              <p class="text-gray-500">
                {data.orderDetail?.receiverPhoneNumber
                  ? data.orderDetail?.receiverPhoneNumber
                  : data.orderDetail?.Receiver?.User.phoneNumber || ""}
              </p>
            </div>
          </div>

          <!-- Add map legend/info section -->
          {#if isOrderInTransit || isOrderAssigned}
            <div class="my-2 flex justify-between text-xs text-gray-600 px-2">
              <div class="flex items-center">
                <div class="w-3 h-3 bg-yellow-400 rounded-full mr-1.5"></div>
                <span>Driver Location</span>
              </div>
              <div class="flex items-center">
                <div class="w-3 h-3 bg-green-500 rounded-full mr-1.5"></div>
                <span>Pickup Point</span>
              </div>
              <div class="flex items-center">
                <div class="w-3 h-3 bg-red-500 rounded-full mr-1.5"></div>
                <span>Delivery Point</span>
              </div>
            </div>
          {/if}

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-1">
              <div class="flex items-start space-x-3">
                <div class="flex-shrink-0 mt-1">
                  <div
                    class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-4 w-4 text-primary"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                </div>
                <div>
                  <h3 class="font-semibold text-primary">Pick Up</h3>
                  <p class="text-gray-700">
                    {data.orderDetail?.pickUpPhysicalLocation}
                  </p>
                  <p class="text-gray-500 text-sm">
                    {dayjs(data.orderDetail?.pickUpTime).format(
                      "MMM DD, YYYY • h:mm A"
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div class="space-y-1">
              <div class="flex items-start space-x-3">
                <div class="flex-shrink-0 mt-1">
                  <div
                    class="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-4 w-4 text-secondary"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8"
                      />
                    </svg>
                  </div>
                </div>
                <div>
                  <h3 class="font-semibold text-secondary">Drop Off</h3>
                  <p class="text-gray-700">
                    {data.orderDetail?.dropOffPhysicalLocation}
                  </p>
                  <p class="text-gray-500 text-sm">
                    {dayjs(data.orderDetail?.dropOffTime).format(
                      "MMM DD, YYYY • h:mm A"
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Payment Info -->
          <div class="mt-4 pt-4 border-t border-gray-100">
            <div class="flex items-start space-x-3">
              <div class="flex-shrink-0 mt-1">
                <div
                  class="w-8 h-8 rounded-full bg-complementary/20 flex items-center justify-center"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4 text-complementary"
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
                </div>
              </div>
              <div>
                <h3 class="font-semibold text-complementary">
                  Payment Details
                </h3>
                <div class="mt-1 grid grid-cols-2 gap-2">
                  <div>
                    <p class="text-xs text-gray-500">Amount</p>
                    <p class="text-gray-800 font-medium">
                      {data.orderDetail?.paymentAmount}
                    </p>
                  </div>
                  <div>
                    <p class="text-xs text-gray-500">Method</p>
                    <p class="text-gray-800 font-medium">
                      {data.orderDetail?.paymentMethod}
                    </p>
                  </div>
                  <div class="col-span-2">
                    <p class="text-xs text-gray-500">Transaction Date</p>
                    <p class="text-gray-800">
                      {dayjs(data.orderDetail?.paymentDate).format(
                        "MMM DD, YYYY • h:mm A"
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Milestones Card -->
      <div
        class="bg-white rounded-2xl overflow-hidden shadow-xl mb-8 transform transition-all duration-500 hover:shadow-2xl"
        in:fly={{ y: 20, duration: 700, delay: 500 }}
      >
        <div
          class="p-6 bg-gradient-to-r from-primary/10 to-primary/5 border-b border-gray-100"
        >
          <h2 class="text-2xl font-bold text-primary">Delivery Milestones</h2>
          <p class="text-gray-500 mt-1">Track your premium delivery journey</p>
        </div>
        <div class="p-6">
          {#if data.orderDetail}
            <div class="space-y-4">
              {#each data.orderDetail.orderMilestone as milestone, i}
                <div
                  class="flex items-center space-x-4 {i !==
                  data.orderDetail.orderMilestone.length - 1
                    ? 'pb-4 border-l-2 border-primary/30 ml-3.5 pl-8'
                    : 'ml-3.5'}"
                  in:fly={{ x: -10, duration: 300, delay: 500 + i * 100 }}
                >
                  <div class="flex-shrink-0 -ml-[26px]">
                    <div
                      class="w-7 h-7 rounded-full {milestone.isCompleted
                        ? 'bg-primary'
                        : 'bg-gray-200'} flex items-center justify-center shadow-md"
                    >
                      {#if milestone.isCompleted}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-4 w-4 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2.5"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      {:else}
                        <span class="h-1.5 w-1.5 rounded-full bg-gray-400"
                        ></span>
                      {/if}
                    </div>
                  </div>
                  <div class="min-w-0 flex-1">
                    <p
                      class="text-gray-800 font-medium {milestone.isCompleted
                        ? ''
                        : 'text-gray-500'}"
                    >
                      {milestone.description}
                    </p>
                    {#if milestone.isCompleted}
                      <p class="text-xs text-gray-500 mt-0.5">
                        Completed
                        {#if milestone.coordinates}
                          • Location tracked
                        {/if}
                      </p>

                      <!-- Find the courier associated with this milestone -->
                      {#if data.orderDetail.OrderDispatch && data.orderDetail.OrderDispatch.length > 0}
                        {#each data.orderDetail.OrderDispatch as dispatch}
                          {#if dispatch.dispatchStatus === "COMPLETED"}
                            <div
                              class="mt-1 flex items-center text-xs text-primary"
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
                                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                />
                              </svg>
                              <span>
                                Completed by: {dispatch.Dispatch
                                  .AssignedEmployee?.User.userName ??
                                  dispatch.Dispatch.AssignedVendorDriver?.User
                                    .userName ??
                                  "Unassigned"}
                              </span>
                            </div>
                          {/if}
                        {/each}
                      {/if}
                    {:else}
                      <p class="text-xs text-gray-400 mt-0.5">
                        Pending
                        {#if data.orderDetail.OrderDispatch && data.orderDetail.OrderDispatch.length > 0}
                          {#each data.orderDetail.OrderDispatch as dispatch}
                            {#if dispatch.dispatchStatus === "INPROGRESS" || dispatch.dispatchStatus === "ASSIGNED"}
                              <span class="ml-1">
                                • Assigned to: {dispatch.Dispatch
                                  .AssignedEmployee?.User.userName ??
                                  dispatch.Dispatch.AssignedVendorDriver?.User
                                    .userName ??
                                  "Unassigned"}
                              </span>
                            {/if}
                          {/each}
                        {/if}
                      </p>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Driver Card -->
      {#if data.orderDetail?.Dispatch?.AssignedEmployee || data.orderDetail?.Dispatch?.AssignedVendorDriver}
        <div
          class="bg-white rounded-2xl overflow-hidden shadow-xl mb-8 transform transition-all duration-500 hover:shadow-2xl"
          in:fly={{ y: 20, duration: 700, delay: 600 }}
        >
          <div
            class="p-6 bg-gradient-to-r from-primary/10 to-primary/5 border-b border-gray-100"
          >
            <h2 class="text-2xl font-bold text-primary">
              Your Delivery Professional
            </h2>
            <p class="text-gray-500 mt-1">Meet your dedicated courier</p>
          </div>
          <div class="p-6 flex items-center space-x-5">
            <div class="flex-shrink-0">
              <div
                class="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-xl font-bold"
              >
                {(
                  data.orderDetail?.Dispatch?.AssignedEmployee?.User.userName ??
                  data.orderDetail?.Dispatch?.AssignedVendorDriver?.User
                    .userName ??
                  ""
                ).charAt(0)}
              </div>
            </div>
            <div>
              <h3 class="text-xl font-semibold text-gray-800">
                {data.orderDetail?.Dispatch?.AssignedEmployee?.User.userName ??
                  data.orderDetail?.Dispatch?.AssignedVendorDriver?.User
                    .userName ??
                  ""}
              </h3>
              <p class="text-gray-600 flex items-center mt-1">
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
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  />
                </svg>
                {data.orderDetail?.Dispatch?.AssignedEmployee?.User
                  .phoneNumber ??
                  data.orderDetail?.Dispatch?.AssignedVendorDriver?.User
                    .phoneNumber ??
                  ""}
              </p>
              <div class="mt-3">
                <button
                  class="text-primary hover:text-primary-dark flex items-center text-sm font-medium"
                >
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
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                  Contact
                </button>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Ratings Card -->
      <div
        class="bg-white rounded-2xl overflow-hidden shadow-xl mb-8 transform transition-all duration-500 hover:shadow-2xl"
        in:fly={{ y: 20, duration: 700, delay: 700 }}
      >
        <div
          class="p-6 bg-gradient-to-r from-primary/10 to-primary/5 border-b border-gray-100"
        >
          <h2 class="text-2xl font-bold text-primary">Order Feedback</h2>
          <p class="text-gray-500 mt-1">Ratings for this delivery service</p>
        </div>
        <div class="p-6">
          {#if data.orderDetail.OrderRating.length > 0}
            <div class="space-y-6">
              {#each data.orderDetail.OrderRating as rating, i}
                <div
                  class="bg-gray-50 rounded-xl p-4 {i !==
                  data.orderDetail.OrderRating.length - 1
                    ? 'border-b border-gray-100 pb-6'
                    : ''}"
                  in:fly={{ y: 10, duration: 300, delay: 700 + i * 100 }}
                >
                  <div class="flex items-center mb-2">
                    <div
                      class="w-8 h-8 rounded-full bg-tertiary/20 flex items-center justify-center text-tertiary font-semibold text-sm"
                    >
                      {(rating.Customer?.User.userName || "U").charAt(0)}
                    </div>
                    <h3 class="ml-2 font-semibold text-tertiary">
                      {rating.Customer?.id ===
                      $page.data.session?.customerData.id
                        ? "Your Feedback"
                        : rating.Customer?.User.userName}
                      {#if rating.Customer?.id === $page.data.session?.customerData.id}
                        <span class="text-xs font-normal text-gray-500 ml-1"
                          >{dayjs(rating.createdAt).format(
                            "MMM DD, YYYY"
                          )}</span
                        >
                      {/if}
                    </h3>
                  </div>
                  <div class="ml-10">
                    <StarRating rating={rating.rating} />
                    <p class="text-gray-600 mt-2 text-sm italic">
                      {rating.comment || "No comment provided."}
                    </p>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-gray-500 text-center py-4">
              No feedback provided yet
            </p>
          {/if}
        </div>
      </div>

      <!-- Driver Ratings Card - Only show if there are ratings -->
      {#if data.orderDetail.DriverRating && data.orderDetail.DriverRating.length > 0}
        <div
          class="bg-white rounded-2xl overflow-hidden shadow-xl mb-8 transform transition-all duration-500 hover:shadow-2xl"
          in:fly={{ y: 20, duration: 700, delay: 750 }}
        >
          <div
            class="p-6 bg-gradient-to-r from-secondary/10 to-secondary/5 border-b border-gray-100"
          >
            <h2 class="text-2xl font-bold text-secondary">Courier Feedback</h2>
            <p class="text-gray-500 mt-1">
              Ratings for delivery professionals on this order
            </p>
          </div>
          <div class="p-6">
            <div class="space-y-6">
              {#each data.orderDetail.DriverRating as rating, i}
                <div
                  class="bg-gray-50 rounded-xl p-4 {i !==
                  data.orderDetail.DriverRating.length - 1
                    ? 'border-b border-gray-100 pb-6'
                    : ''}"
                  in:fly={{ y: 10, duration: 300, delay: 750 + i * 100 }}
                >
                  <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center">
                      <div
                        class="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center text-secondary font-semibold text-sm"
                      >
                        {(rating.Customer?.User.userName || "U").charAt(0)}
                      </div>
                      <h3 class="ml-2 font-semibold text-secondary">
                        {rating.Customer?.id ===
                        $page.data.session?.customerData.id
                          ? "Your Feedback"
                          : rating.Customer?.User.userName}
                        {#if rating.Customer?.id === $page.data.session?.customerData.id}
                          <span class="text-xs font-normal text-gray-500 ml-1"
                            >{dayjs(rating.createdAt).format(
                              "MMM DD, YYYY"
                            )}</span
                          >
                        {/if}
                      </h3>
                    </div>
                    <div class="text-xs text-gray-500">
                      For:
                      {#each data.orderDetail.OrderDispatch as dispatch}
                        {#if (dispatch.Dispatch.AssignedEmployee?.User.id && rating.userId && String(dispatch.Dispatch.AssignedEmployee?.User.id) === String(rating.userId)) || (dispatch.Dispatch.AssignedVendorDriver?.User.id && rating.userId && String(dispatch.Dispatch.AssignedVendorDriver?.User.id) === String(rating.userId))}
                          <span class="font-medium text-secondary">
                            {dispatch.Dispatch.AssignedEmployee?.User
                              .userName ??
                              dispatch.Dispatch.AssignedVendorDriver?.User
                                .userName}
                          </span>
                        {/if}
                      {/each}
                    </div>
                  </div>
                  <div class="ml-10">
                    <StarRating rating={rating.rating} />
                    <p class="text-gray-600 mt-2 text-sm italic">
                      {rating.comment || "No comment provided."}
                    </p>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/if}

      <!-- Place new order button -->
      <div
        class="mt-10 flex justify-center"
        in:fly={{ y: 20, duration: 500, delay: 800 }}
      >
        <a
          href="/create-order"
          class="inline-flex items-center justify-center bg-gradient-to-r from-primary to-primary/80 text-white py-3 px-8 rounded-full shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300 font-medium text-lg"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 mr-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />
          </svg>
          Place a New Order
        </a>
      </div>
    </div>
  </div>
{/if}

<!-- Rate Service Modal -->
{#if orderRateModal}
  <div
    class="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-75 flex items-center justify-center"
    in:fade={{ duration: 200 }}
    out:fade={{ duration: 150 }}
  >
    <div
      use:clickOutside={() => (orderRateModal = false)}
      class="bg-white w-full max-w-md mx-4 rounded-2xl shadow-2xl overflow-hidden transform transition-all"
      in:scale={{ duration: 300, start: 0.95, opacity: 0 }}
    >
      <div
        class="bg-gradient-to-r from-primary/10 to-primary/5 px-6 py-4 border-b border-gray-100"
      >
        <h2 class="text-2xl font-bold text-primary">Rate Your Experience</h2>
        <p class="text-gray-500 mt-1">We value your feedback</p>
      </div>
      <form
        use:addOrderRatingEnhance
        method="post"
        action="?/addOrderRating"
        class="p-6"
      >
        <div class="flex flex-col items-center my-6">
          <p class="text-gray-700 mb-4 font-medium">
            How would you rate our service?
          </p>
          <div class="transform scale-125">
            <StarRating bind:rating={ratingOrder} />
          </div>
        </div>

        <div class="mb-6">
          <label
            for="serviceComment"
            class="block text-gray-700 font-medium mb-2"
          >
            Share your thoughts
          </label>
          <textarea
            bind:value={$addOrderRatingForm.comment}
            {...$addOrderRatingConstraints.comment}
            id="serviceComment"
            name="comment"
            placeholder="Tell us about your experience..."
            class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 h-36 resize-none transition-colors"
          ></textarea>
        </div>

        <div class="flex space-x-3">
          <button
            type="button"
            on:click={() => (orderRateModal = false)}
            class="flex-1 py-3 px-4 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="flex-1 py-3 px-4 bg-gradient-to-r from-complementary to-complementary/90 text-white rounded-xl font-medium shadow-sm hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-complementary/50"
          >
            Submit
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Rate Driver Modal -->
{#if driverRateModal}
  <div
    class="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-75 flex items-center justify-center"
    in:fade={{ duration: 200 }}
    out:fade={{ duration: 150 }}
  >
    <div
      use:clickOutside={() => (driverRateModal = false)}
      class="bg-white w-full max-w-md mx-4 rounded-2xl shadow-2xl overflow-hidden transform transition-all"
      in:scale={{ duration: 300, start: 0.95, opacity: 0 }}
    >
      <div
        class="bg-gradient-to-r from-secondary/10 to-secondary/5 px-6 py-4 border-b border-gray-100"
      >
        <h2 class="text-2xl font-bold text-secondary">Rate Your Courier</h2>
        <p class="text-gray-500 mt-1">Help us recognize excellent service</p>
      </div>
      {#if unratedDrivers.length === 0}
        <div class="p-6 text-center">
          <div class="text-gray-600 mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-12 w-12 mx-auto mb-2 text-gray-400"
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
            <p>There are no more eligible couriers to rate for this order.</p>
          </div>
          <button
            type="button"
            on:click={() => (driverRateModal = false)}
            class="py-3 px-4 bg-secondary text-white rounded-xl font-medium shadow-sm hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-secondary/50"
          >
            Close
          </button>
        </div>
      {:else}
        <form
          use:addDriverRatingEnhance
          method="post"
          action="?/addDriverRating"
          class="p-6"
        >
          <div class="mb-6">
            <label class="block text-gray-700 font-medium mb-2">
              Select Courier
            </label>
            <div class="relative">
              <select
                bind:value={$addDriverRatingForm.driverUserId}
                {...$addDriverRatingConstraints.driverUserId}
                class="w-full appearance-none px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary/50 bg-white transition-colors"
                name="driverUserId"
              >
                {#each unratedDrivers as ds}
                  {#if ds.Dispatch.AssignedEmployee?.User.id || ds.Dispatch.AssignedVendorDriver?.User.id}
                    <option
                      value={ds.Dispatch.AssignedEmployee?.User.id ??
                        ds.Dispatch.AssignedVendorDriver?.User.id}
                    >
                      {ds.Dispatch.AssignedEmployee?.User.userName ??
                        ds.Dispatch.AssignedVendorDriver?.User.userName ??
                        "Unknown Driver"}
                      {#if ds.dispatchStatus === "COMPLETED"}
                        (Completed)
                      {:else}
                        (In Progress)
                      {/if}
                    </option>
                  {/if}
                {/each}
              </select>
              <div
                class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3"
              >
                <svg
                  class="h-4 w-4 text-gray-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </div>

          <div class="flex flex-col items-center my-6">
            <p class="text-gray-700 mb-4 font-medium">
              How would you rate this courier?
            </p>
            <div class="transform scale-125">
              <StarRating bind:rating={ratingDriver} />
            </div>
          </div>

          <div class="mb-6">
            <label
              for="driverComment"
              class="block text-gray-700 font-medium mb-2"
            >
              Share your thoughts
            </label>
            <textarea
              bind:value={$addDriverRatingForm.comment}
              {...$addDriverRatingConstraints.comment}
              id="driverComment"
              name="comment"
              placeholder="Tell us about your experience with this courier..."
              class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary/50 h-36 resize-none transition-colors"
            ></textarea>
          </div>

          <div class="flex space-x-3">
            <button
              type="button"
              on:click={() => (driverRateModal = false)}
              class="flex-1 py-3 px-4 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="flex-1 py-3 px-4 bg-gradient-to-r from-secondary to-secondary/90 text-white rounded-xl font-medium shadow-sm hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-secondary/50"
            >
              Submit
            </button>
          </div>
        </form>
      {/if}
    </div>
  </div>
{/if}

<!-- Cancellation Modal -->
{#if showCancellationModal}
  <div
    class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
    on:click|self={() => {
      showCancellationModal = false;
    }}
    transition:fade={{ duration: 200 }}
  >
    <div
      class="bg-white rounded-xl shadow-xl max-w-md w-full p-6"
      transition:scale={{ duration: 200, start: 0.95 }}
    >
      <h3 class="text-xl font-bold text-gray-800 mb-4">Cancel Your Order</h3>
      <p class="text-gray-600 mb-4">
        Are you sure you want to cancel this order? This action cannot be
        undone.
      </p>
      <form
        method="post"
        action="?/cancelOrder"
        use:enhance={() => {
          isSubmittingCancellation = true;

          return async ({ result }) => {
            isSubmittingCancellation = false;

            if (result.type === "success" && result.data?.success) {
              showCancellationModal = false;
              toast.push("Your order has been successfully cancelled", {
                theme: {
                  "--toastBackground": "#10B981",
                  "--toastBarBackground": "#059669",
                },
              });
              setTimeout(() => window.location.reload(), 1000);
            } else if (result.type === "success") {
              toast.push(result.data?.error || "Failed to cancel order", {
                theme: {
                  "--toastBackground": "#EF4444",
                  "--toastBarBackground": "#DC2626",
                },
              });
            } else {
              toast.push("Failed to cancel order", {
                theme: {
                  "--toastBackground": "#EF4444",
                  "--toastBarBackground": "#DC2626",
                },
              });
            }
          };
        }}
      >
        <div class="mb-4">
          <label
            for="cancellationReason"
            class="block text-sm font-medium text-gray-700 mb-1"
          >
            Reason for Cancellation
          </label>
          <textarea
            id="cancellationReason"
            name="cancellationReason"
            bind:value={cancellationReason}
            required
            rows="3"
            class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-secondary"
            placeholder="Please let us know why you're cancelling this order..."
          ></textarea>
        </div>

        <div class="flex justify-end space-x-3 mt-6">
          <button
            type="button"
            class="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            on:click={() => {
              showCancellationModal = false;
            }}
            disabled={isSubmittingCancellation}
          >
            Cancel
          </button>
          <button
            type="submit"
            class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center"
            disabled={!cancellationReason || isSubmittingCancellation}
          >
            {#if isSubmittingCancellation}
              <svg
                class="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
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
              Confirm Cancellation
            {/if}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Add a refresh button and connection status -->
<div class="flex items-center justify-between mt-2 px-2 text-xs">
  <div class="flex items-center">
    <span
      class="w-2 h-2 rounded-full {$isConnected
        ? 'bg-green-500 animate-pulse'
        : 'bg-gray-400'} mr-1"
    ></span>
    <span class={$isConnected ? "text-green-600" : "text-gray-500"}>
      {$isConnected ? "Live Tracking" : "Offline"}
    </span>
  </div>

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
    class="px-2 py-1 bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 transition flex items-center"
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
