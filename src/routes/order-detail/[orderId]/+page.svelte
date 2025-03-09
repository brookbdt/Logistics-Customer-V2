<script lang="ts">
  import { page } from "$app/stores";
  import GoogleMaps from "$lib/components/google-maps.svelte";
  import StarRating from "$lib/components/star-rating.svelte";
  import { clickOutside } from "$lib/utils/click-outside.js";
  import { toast } from "@zerodevx/svelte-toast";
  import dayjs from "dayjs";
  import { fly, fade, scale } from "svelte/transition";
  import { quintOut, elasticOut } from "svelte/easing";
  import { onMount } from "svelte";
  // import Barcode from "svelte-barcode";
  import { superForm } from "sveltekit-superforms/client";

  export let data;
  export let form;

  let [mapLat, mapLng] = data.orderDetail?.pickUpMapLocation.split(",") || [];
  let [destinationLat, destinationLng] =
    data.orderDetail?.dropOffMapLocation.split(",") || [];
  let [deliveryLat, deliveryLng] =
    data.orderDetail?.Tracker?.mapLocation.split(",") || [];

  let orderRateModal = false;
  let driverRateModal = false;
  let ratingOrder: any;
  let ratingDriver: any;
  let pageLoaded = false;

  // Determine if order is completed and can be rated
  $: isOrderCompleted = data.orderDetail?.orderStatus === "COMPLETED";

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

  onMount(() => {
    setTimeout(() => {
      pageLoaded = true;
    }, 200);
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
      formData.set("rating", ratingOrder);
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

      formData.set("rating", ratingDriver);
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
            <span>Rate Service (Available when completed)</span>
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
            <span>No Eligible Couriers Yet</span>
          </div>
        {:else if ratedDrivers.length > 0}
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
            <span>No Eligible Couriers Yet</span>
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
          {#key [mapLat, mapLng, destinationLat, destinationLng, deliveryLat, deliveryLng]}
            <GoogleMaps
              display={true}
              destinationLat={Number(destinationLat)}
              destinationLng={Number(destinationLng)}
              lng={Number(mapLng)}
              lat={Number(mapLat)}
              deliveryLat={Number(deliveryLat)}
              deliveryLng={Number(deliveryLng)}
              showRoute={true}
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
