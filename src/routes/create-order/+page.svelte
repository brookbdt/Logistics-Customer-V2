<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import {
    calculatePrice as calculatePriceUtil,
    extractCityFromAddress as extractCityUtil,
    formatPrice,
    normalizeCity,
    type PriceBreakdown,
    type PricingParams,
  } from "$lib/utils/pricing";
  import type { PackageType } from "@prisma/client";
  import { toast } from "@zerodevx/svelte-toast";
  import { cubicOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";
  import type { PageData } from "./$types";
  import PackageTypeComponent from "./package-type.svelte";
  import ReceiverInfo from "./receiver-info.svelte";
  import SenderInfo from "./sender-info.svelte";
  // Import SuperForm and types
  import { createOrderSchema } from "$lib/utils/schemas/create-order";
  import { zod } from "sveltekit-superforms/adapters";
  import { superForm } from "sveltekit-superforms/client";

  export let data: PageData;

  // Add a flag to track if an order has been completed to prevent duplicate submissions
  let orderCompleted = false;

  const orderForm = superForm(data.form, {
    validators: zod(createOrderSchema),
    dataType: "json",
    onUpdated({ form }) {
      if (form.valid) {
        toast.push("Order processed successfully!");
      }
    },
    onError({ result }) {
      console.error("Form submission error:", result);
      if (result.type === "error" && result.error) {
        toast.push(result.error.message || "An error occurred", {
          theme: {
            "--toastBackground": "#FEE2E2",
            "--toastBarBackground": "#EF4444",
            "--toastColor": "#7F1D1D",
          },
        });
      }
    },
    onSubmit: () => {
      // Prevent multiple submissions
      if (orderCompleted) {
        console.log("Order already completed, preventing resubmission");
        return;
      }
      console.log("Form is being submitted with data:", $form);
      handleSubmit();
    },
    onResult({ result }) {
      console.log("Form submission result:", result);
      if (result.type === "success") {
        // Set the order completed flag to prevent duplicate submissions
        orderCompleted = true;

        if (result.data && result.data.newOrder) {
          toast.push(
            "Order created successfully! Your delivery is on its way.",
            {
              theme: {
                "--toastBackground": "#10B981",
                "--toastBarBackground": "#059669",
              },
            }
          );

          // Set the completed order ID and move to completion step
          if (result.data?.orderId) {
            // Store the data we need to display the success page
            completedOrderId = result.data.orderId;

            // Store completed order details before resetting form
            const orderDetails = {
              userName: $form.userName,
              pickUpLocation: $form.pickUpLocation,
              phoneNumber: $form.phoneNumber,
              receiverUsername: $form.receiverUsername,
              receiverPhoneNumber: $form.receiverPhoneNumber,
              dropOffLocation: $form.dropOffLocation,
              packageType: $form.packageType,
              goodsType: $form.goodsType,
              orderType: $form.orderType,
              actualWeight: $form.actualWeight,
              inCity: $form.inCity,
              paymentOption: $form.paymentOption,
            };

            // Completely reset form state to avoid validation errors
            try {
              // We need to handle the transition to completion differently
              // Instead of keeping superForm active during the completion screen
              componentsOrder = 4;

              // Store the order details for the completion page to use
              completedOrderDetails = orderDetails;

              // Disable navigation back to previous steps after completion
              disableStepNavigation = true;
            } catch (error) {
              console.error("Error handling form success:", error);
            }
          } else {
            console.warn("Order ID not returned in success response");
            toast.push(
              "Order was processed but order ID is missing. Please check your orders history.",
              {
                theme: {
                  "--toastBackground": "#FEF3C7",
                  "--toastBarBackground": "#F59E0B",
                  "--toastColor": "#92400E",
                },
              }
            );
          }

          // We've removed the automatic redirect to finalize-order page to avoid validation errors
          // User will use the action buttons on the completion page
        } else if (result.data && result.data.draftOrder) {
          // This is a pay_now order with a draft order created
          // Redirect to payment page
          toast.push("Order draft created. Redirecting to payment...", {
            theme: {
              "--toastBackground": "#3B82F6",
              "--toastBarBackground": "#2563EB",
            },
          });

          if (browser && result.data.paymentUrl) {
            // Open the payment URL in a new tab
            window.open(result.data.paymentUrl, "_blank");

            // Also show the order completion screen with appropriate message
            completedOrderId = result.data.orderId;

            // Create generic order details until payment completes
            completedOrderDetails = {
              userName: $form.userName,
              pickUpLocation: $form.pickUpLocation,
              phoneNumber: $form.phoneNumber,
              receiverUsername: $form.receiverUsername,
              receiverPhoneNumber: $form.receiverPhoneNumber,
              dropOffLocation: $form.dropOffLocation,
              packageType: $form.packageType,
              goodsType: $form.goodsType,
              orderType: $form.orderType,
              actualWeight: $form.actualWeight,
              inCity: $form.inCity,
              paymentOption: $form.paymentOption,
            };

            componentsOrder = 4;
          }

          // Disable navigation back to previous steps after completion
          disableStepNavigation = true;
        }
      } else if (result.type === "error") {
        console.error("Submission error:", result.error);
        toast.push(result.error.message || "An error occurred", {
          theme: {
            "--toastBackground": "#FEE2E2",
            "--toastBarBackground": "#EF4444",
            "--toastColor": "#7F1D1D",
          },
        });
      } else if (result.type === "failure") {
        console.error("Validation failure:", result.data);
        // Check for a server-provided error message first
        const serverErrorMessage = result.data?.errorMessage;

        // Fall back to form validation errors if no specific server message
        const formErrorMessages = result.data?.form?.errors
          ? Object.values(result.data.form.errors).flat().join(", ")
          : "Form validation failed";

        // Use the server error message if available, otherwise use form errors
        const errorMessage = serverErrorMessage || formErrorMessages;

        // Show a more user-friendly message for common errors
        let userFriendlyMessage = errorMessage;

        if (
          errorMessage.includes("warehouse") &&
          errorMessage.includes("location")
        ) {
          userFriendlyMessage =
            "We're having trouble finding a warehouse near your locations. Please try a different pickup or delivery address.";
        } else if (errorMessage.includes("coordinate")) {
          userFriendlyMessage =
            "There's an issue with the map coordinates. Please try setting the locations again.";
        }

        toast.push(userFriendlyMessage, {
          theme: {
            "--toastBackground": "#FEE2E2",
            "--toastBarBackground": "#EF4444",
            "--toastColor": "#7F1D1D",
          },
        });
      }
    },
  });

  function handleSubmit() {
    console.log("handleSubmit");
    // Validate required fields
    if (
      !$form.packageType ||
      !$form.orderType ||
      !$form.goodsType ||
      !$form.packagingType
    ) {
      toast.push("Please complete all required package details", {
        theme: {
          "--toastBackground": "#FEF3C7",
          "--toastBarBackground": "#F59E0B",
          "--toastColor": "#92400E",
        },
      });
      return;
    }

    if (!$form.actualWeight || $form.actualWeight < 0.1) {
      $form.actualWeight = 0.5; // Set a default weight if not specified
    }

    // Check for missing map coordinates
    if (!$form.mapAddress || !$form.dropOffMapAddress) {
      console.error("Missing map coordinates:", {
        pickupCoords: $form.mapAddress,
        dropoffCoords: $form.dropOffMapAddress,
      });
      toast.push(
        "Location coordinates are missing. Please ensure pickup and delivery locations are set correctly.",
        {
          theme: {
            "--toastBackground": "#FEE2E2",
            "--toastBarBackground": "#EF4444",
            "--toastColor": "#7F1D1D",
          },
        }
      );
      return;
    }

    // Recalculate total cost to ensure latest changes are captured
    const price = calculateEstimatedPrice();

    // Ensure form has up-to-date pricing information
    if (priceBreakdown) {
      $form.priceBreakdown = priceBreakdown;
      $form.totalCost = priceBreakdown.totalCost;
    }

    console.log("Submitting order with final price:", $form.totalCost);
  }

  // Initialize superForm
  const { form, errors, enhance, constraints, message, submitting, validate } =
    orderForm;

  $: console.log({ $form });

  // Reference to the top container and progress bar
  let formContainer: HTMLElement;
  let showPriceBreakdown = false;

  // Function to scroll to top smoothly when navigating between components
  function scrollToTop() {
    if (!browser) return; // Skip execution if not in browser environment

    // Check if the formContainer exists
    if (formContainer) {
      // Get the bounding rectangle of the form container
      const rect = formContainer.getBoundingClientRect();
      const scrollTop =
        window.pageYOffset || document.documentElement.scrollTop;

      // Calculate the top position with a small offset to account for fixed headers
      const offsetPosition = scrollTop + rect.top - 15; // 15px offset

      // Scroll to the calculated position
      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    } else {
      // Fallback if the reference is not yet set
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  }

  // Watch for changes in componentsOrder to trigger scrolling
  $: if (componentsOrder) {
    // Use setTimeout to ensure the DOM has updated before scrolling
    // Using a slightly longer delay to ensure transitions have time to start
    setTimeout(() => scrollToTop(), 150);
  }

  let componentsOrder = 1;
  let pickupLat: number | null = null;
  let pickupLng: number | null = null;
  let dropOffLat: number | null = null;
  let dropOffLng: number | null = null;
  let packageTemp: PackageType;
  let isSubmitting = false;
  let estimatedPrice: string | null = null;
  let priceBreakdown: PriceBreakdown | null = null;
  let receiverInfo: any = null;

  // Add pricing data state
  let pricingData = {
    totalCost: 0,
    priceBreakdown: null as PriceBreakdown | null,
    distanceInKm: 0,
    estimatedTimeInMinutes: 0,
    originCity: "",
    destinationCity: "",
    deliveryType: null as "IN_CITY" | "BETWEEN_CITIES" | null,
  };

  // Order completion data
  let completedOrderId: string | null = null;
  let completedOrderDetails: any = null;

  // Add animation constants for consistent transitions across components
  const fadeTransition = {
    duration: 300,
    easing: (t: number) => 1 - Math.pow(1 - t, 3),
  }; // cubic-out easing

  // Flag to disable navigation between steps after order completion
  let disableStepNavigation = false;

  // Function to handle receiver info next event
  function handleReceiverInfoNext(event: CustomEvent) {
    // Store the coordinates from the receiver component
    if (event.detail && event.detail.coordinates) {
      dropOffLat = event.detail.coordinates.lat;
      dropOffLng = event.detail.coordinates.lng;
      console.log("Dropoff coordinates stored:", dropOffLat, dropOffLng);
    }

    // Store the receiver info
    if (event.detail && event.detail.receiverInfo) {
      receiverInfo = event.detail.receiverInfo;

      if (receiverInfo.city || receiverInfo.serviceCity) {
        // Use serviceCity (normalized city name) if available, otherwise use city
        const cityFromReceiver = receiverInfo.serviceCity || receiverInfo.city;

        console.log("Setting destinationCity from receiver:", cityFromReceiver);
        $form.destinationCity = cityFromReceiver;
      }
    }

    // Calculate pricing and distance with updated information
    if (pickupLat && pickupLng && dropOffLat && dropOffLng) {
      try {
        // Calculate distance between points using the Haversine formula
        const distance = calculateDistance(
          pickupLat,
          pickupLng,
          dropOffLat,
          dropOffLng
        );

        console.log("Calculated distance:", distance.toFixed(2), "km");

        // Store the distance in the form
        $form.distanceInKm = distance;

        // Estimate time based on average speed (30 km/h for city, 60 km/h for between cities)
        // Normalize origin and destination cities
        const originCity = normalizeCity(
          $form.originCity ||
            extractCityUtil(
              $form.pickUpLocation,
              data?.pricingConfig?.cities
            ) ||
            "Addis Ababa"
        );

        const destinationCity = normalizeCity(
          $form.destinationCity ||
            extractCityUtil(
              $form.dropOffLocation,
              data?.pricingConfig?.cities
            ) ||
            "Addis Ababa"
        );

        // Determine if this is an in-city delivery (case insensitive comparison)
        const isInCity =
          originCity.toLowerCase() === destinationCity.toLowerCase();

        // Set the inCity flag based on the calculation (1 for in-city, 0 for between cities)
        $form.inCity = isInCity ? "1" : "0";

        // Calculate estimated time based on average speed
        const avgSpeed = isInCity ? 30 : 60; // km/h
        const timeInHours = distance / avgSpeed;
        const timeInMinutes = Math.ceil(timeInHours * 60);

        // Store the estimated time
        $form.estimatedTimeInMinutes = timeInMinutes;

        console.log("Delivery type:", isInCity ? "In-city" : "Between cities");
        console.log("Estimated time:", timeInMinutes, "minutes");
      } catch (error) {
        console.error("Error calculating distance and time:", error);
      }
    }

    // Move to the next step
    if (componentsOrder >= 2) {
      componentsOrder += 1;
      // The reactive scroll will handle moving to the top
    }
  }

  // Payment option that will be sent with form
  $: $form.paymentOption = $form.paymentOption || "pay_on_pickup";

  // Initialize default values for form fields that might be undefined
  $: {
    if (!$form.orderType) $form.orderType = "STANDARD";
    if (!$form.goodsType) $form.goodsType = "NORMAL";
    if (!$form.packagingType) $form.packagingType = "STANDARD_BOX";
    if (!$form.vehicleType) $form.vehicleType = "CAR";
    if (!$form.actualWeight) $form.actualWeight = 0.5;
  }

  // Initialize form values from session data if available
  $: {
    if ($page.data.session?.userData) {
      if (!$form.userName && $page.data.session?.userData?.userName) {
        $form.userName = $page.data.session.userData.userName || "";
      }
      if (!$form.phoneNumber && $page.data.session?.userData?.phoneNumber) {
        $form.phoneNumber = $page.data.session.userData.phoneNumber || "";
      }
    }

    if ($page.data.session?.customerData) {
      if (
        !$form.pickUpLocation &&
        $page.data.session?.customerData?.physicalAddress
      ) {
        $form.pickUpLocation =
          $page.data.session.customerData.physicalAddress || "";
      }
      if (!$form.mapAddress && $page.data.session?.customerData?.mapAddress) {
        $form.mapAddress = $page.data.session.customerData.mapAddress || "";
      }
    }
  }

  // Computed properties
  $: dimensionalWeight =
    $form.length && $form.width && $form.height
      ? ($form.length * $form.width * $form.height) / 5000
      : 0;
  $: effectiveWeight = Math.max(
    $form.actualWeight || 0,
    dimensionalWeight || 0
  );

  // Progress percentage calculation
  $: progressPercentage = ((componentsOrder - 1) / 3) * 100;

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
        extractCityFromAddress($form.pickUpLocation) || "Addis Ababa";
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
    if (!$form.packageType) {
      return "0.00";
    }

    try {
      console.log("Calculating estimated price in +page.svelte");

      // Get pricing config with proper type checking
      const pricingConfig = data?.pricingConfig || {};

      // Get customer type with fallback
      const customerType =
        (data as any)?.session?.customerData?.customerType || "INDIVIDUAL";

      console.log("Using customer type:", customerType);

      // Check if customer has premium status
      const isPremium = !!(data as any)?.session?.customerData?.premium;
      console.log("Premium status:", isPremium);

      // Determine delivery type based on inCity flag - inCity="1" means it's within city
      const deliveryType = $form.inCity === "1" ? "IN_CITY" : "BETWEEN_CITIES";

      // Extract city information using the shared utility
      const originCity = normalizeCity(
        $form.originCity ||
          extractCityUtil($form.pickUpLocation, pricingConfig.cities) ||
          "Addis Ababa",
        pricingConfig.cities
      );

      const destinationCity = normalizeCity(
        $form.destinationCity ||
          extractCityUtil($form.dropOffLocation, pricingConfig.cities) ||
          "Addis Ababa",
        pricingConfig.cities
      );

      console.log("Normalized cities:", { originCity, destinationCity });
      console.log("Distance:", $form.distanceInKm);
      console.log("Time:", $form.estimatedTimeInMinutes);

      // Calculate dimensional weight if dimensions are available
      const dimWeight =
        $form.length && $form.width && $form.height
          ? ($form.length * $form.width * $form.height) / 5000
          : 0;

      // Use existing calculated dimensionalWeight if available
      const dimensionalWeightToUse = dimWeight || dimensionalWeight || 0;

      // Prepare pricing parameters
      const pricingParams: PricingParams = {
        deliveryType,
        originCity,
        destinationCity,
        distanceInKm: $form.distanceInKm || 0,
        estimatedTimeInMinutes: $form.estimatedTimeInMinutes || 0,
        customerType,
        hasSubscription: !!data?.session,
        isPremium,
        orderType: $form.orderType,
        goodsType: $form.goodsType,
        packagingType: $form.packagingType,
        actualWeight: $form.actualWeight || 0,
        dimensionalWeight: dimensionalWeightToUse,
        vehicleType: $form.vehicleType,
      };

      console.log("Pricing parameters:", pricingParams);

      // Calculate price using the utility function
      const result = calculatePriceUtil(pricingParams, pricingConfig);

      console.log("Price calculation result:", result);

      // Store price breakdown for display
      priceBreakdown = result;

      // Update the form's priceBreakdown field for server submission
      $form.priceBreakdown = result;
      $form.totalCost = result.totalCost;

      // Update global pricing data state for reference
      pricingData = {
        totalCost: result.totalCost,
        priceBreakdown: result,
        distanceInKm: $form.distanceInKm || 0,
        estimatedTimeInMinutes: $form.estimatedTimeInMinutes || 0,
        originCity: originCity,
        destinationCity: destinationCity,
        deliveryType: deliveryType,
      };

      return formatPrice(result.totalCost);
    } catch (error) {
      console.error("Error calculating price:", error);
      return "0.00";
    }
  }

  // Add reactive statements to update price when relevant inputs change
  $: if ($form.packageType && $form.inCity !== undefined) {
    estimatedPrice = calculateEstimatedPrice();
  }

  // Also update when any pricing factor changes
  $: if (
    $form.orderType ||
    $form.goodsType ||
    $form.packagingType ||
    $form.vehicleType ||
    $form.actualWeight ||
    $form.originCity ||
    $form.destinationCity ||
    $form.length ||
    $form.width ||
    $form.height ||
    $form.distanceInKm ||
    $form.estimatedTimeInMinutes
  ) {
    if ($form.packageType && $form.inCity !== undefined) {
      estimatedPrice = calculateEstimatedPrice();
    }
  }

  // Set default packaging type and vehicle type based on available options
  $: {
    // Set default packaging type to first available option
    const availablePackaging = getAvailablePackagingOptions();
    if (
      availablePackaging.length > 0 &&
      !availablePackaging.includes($form.packagingType as any)
    ) {
      $form.packagingType = availablePackaging[0];
    }

    // Set default vehicle type to first available option
    const availableVehicles = getAvailableVehicleTypes();
    if (
      availableVehicles.length > 0 &&
      !availableVehicles.includes($form.vehicleType as any)
    ) {
      $form.vehicleType = availableVehicles[0];
    }
  }

  // Helper function to extract city from address
  function extractCityFromAddress(address: string): string | null {
    return extractCityUtil(address, data?.pricingConfig?.cities, "Addis Ababa");
  }

  // Helper function to get customer type

  // Helper function to check if it's peak hour
  function isPeakHour(): boolean {
    const currentHour = new Date().getHours();
    return currentHour >= 17 && currentHour <= 19;
  }

  // Helper function to calculate distance between two points using Haversine formula
  function calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in km
    return distance;
  }

  // Function to completely reset form and start over
  function resetOrderForm() {
    if (browser) {
      // Reset the completion flags
      orderCompleted = false;
      disableStepNavigation = false;
      completedOrderId = null;
      completedOrderDetails = null;

      // Reset form to initial values with all required properties
      $form = {
        // Basic sender information
        userName: $page.data.session?.userData?.userName || "",
        phoneNumber: $page.data.session?.userData?.phoneNumber || "",
        pickUpLocation: $page.data.session?.customerData?.physicalAddress || "",
        mapAddress: $page.data.session?.customerData?.mapAddress || "",

        // Receiver information (with empty defaults)
        receiverUsername: "",
        receiverPhoneNumber: "",
        receiverEmail: "",
        dropOffLocation: "",
        dropOffMapAddress: "",
        inCity: "1", // Default to in-city delivery

        // City information
        originCity: "Addis Ababa", // Default city
        destinationCity: "Addis Ababa", // Default city
        deliveryCity: "Addis Ababa", // Default city

        // Package and order details
        packageType: "DOCUMENT",
        orderType: "STANDARD",
        goodsType: "NORMAL",
        packagingType: "STANDARD_BOX",
        vehicleType: "CAR",
        actualWeight: 0.5,
        paymentOption: "pay_on_pickup",

        // Optional fields with defaults
        length: 0,
        width: 0,
        height: 0,
        distanceInKm: 0,
        estimatedTimeInMinutes: 0,
        // Provide a properly shaped priceBreakdown object
        priceBreakdown: {
          baseShippingCost: 0,
          effectiveWeight: 0.5,
          customerTypeMultiplier: 1,
          subscriptionTypeMultiplier: 1,
          orderTypeMultiplier: 1,
          vehicleTypeMultiplier: 1,
          packagingCost: 0,
          goodsTypeMultiplier: 1,
          multipliedShippingCost: 0,
          additionalFees: [],
          // Add the missing properties
          premiumTypeMultiplier: 1,
          totalAdditionalFees: 0,
          totalCost: 0,
        },
        totalCost: 0,
      };

      // Reset validation state
      errors.update(() => ({}));

      // Reset componentsOrder to the first step
      componentsOrder = 1;

      // Reset additional state
      pickupLat = null;
      pickupLng = null;
      dropOffLat = null;
      dropOffLng = null;
      packageTemp = null as unknown as PackageType; // Reset with proper type casting
      priceBreakdown = null;
      estimatedPrice = null;

      // Toast notification
      toast.push("Ready to create a new order", {
        theme: {
          "--toastBackground": "#3B82F6",
          "--toastBarBackground": "#2563EB",
        },
      });
    }
  }
</script>

<div class="max-w-3xl mx-auto px-4 py-8" bind:this={formContainer}>
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
            on:click={() => {
              if (!disableStepNavigation) componentsOrder = 1;
              // No need to manually call scrollToTop() as the reactive statement will handle it
            }}
            class="{componentsOrder >= 1
              ? 'bg-secondary text-white'
              : 'bg-gray-200 text-gray-500'} rounded-full h-10 w-10 flex justify-center items-center transition-all duration-300 shadow-md hover:shadow-lg {disableStepNavigation &&
            componentsOrder !== 1
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:shadow-lg'}"
            disabled={disableStepNavigation && componentsOrder !== 1}
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
            on:click={() => {
              if (!disableStepNavigation && componentsOrder >= 2)
                componentsOrder = 2;
              // No need to manually call scrollToTop() as the reactive statement will handle it
            }}
            class="{componentsOrder >= 2
              ? 'bg-secondary text-white'
              : 'bg-gray-200 text-gray-500'} rounded-full h-10 w-10 flex justify-center items-center transition-all duration-300 shadow-md {disableStepNavigation &&
            componentsOrder !== 2
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:shadow-lg'}"
            disabled={disableStepNavigation && componentsOrder !== 2}
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
            on:click={() => {
              if (!disableStepNavigation && componentsOrder >= 3)
                componentsOrder = 3;
              // No need to manually call scrollToTop() as the reactive statement will handle it
            }}
            class="{componentsOrder >= 3
              ? 'bg-secondary text-white'
              : 'bg-gray-200 text-gray-500'} rounded-full h-10 w-10 flex justify-center items-center transition-all duration-300 shadow-md {disableStepNavigation &&
            componentsOrder !== 3
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:shadow-lg'}"
            disabled={disableStepNavigation && componentsOrder !== 3}
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

  <form method="post" action="?/createOrder" use:enhance>
    <!-- Form container with card styling -->
    <div
      class="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100"
    >
      <div class="p-6">
        <!-- Hidden fields for sender info -->
        <input type="hidden" name="userName" value={$form.userName} />
        {#if $form.originCity}
          <input type="hidden" name="originCity" value={$form.originCity} />
        {/if}
        {#if $form.destinationCity}
          <input
            type="hidden"
            name="destinationCity"
            value={$form.destinationCity}
          />
        {/if}
        <input type="hidden" name="phoneNumber" value={$form.phoneNumber} />
        <input type="hidden" name="pickUpTime" value={$form.pickUpTime} />
        <input
          type="hidden"
          name="pickUpLocation"
          value={$form.pickUpLocation}
        />
        <input type="hidden" name="mapAddress" value={$form.mapAddress} />

        <!-- Hidden fields for receiver info -->
        {#if $form.receiverUsername}
          <input
            type="hidden"
            name="receiverUsername"
            value={$form.receiverUsername}
          />
          <input
            type="hidden"
            name="receiverPhoneNumber"
            value={$form.receiverPhoneNumber}
          />
          <input
            type="hidden"
            name="receiverEmail"
            value={$form.receiverEmail}
          />
          <input type="hidden" name="inCity" value={$form.inCity} />
          <input
            type="hidden"
            name="dropOffLocation"
            value={$form.dropOffLocation}
          />
          {#if $form.receiverId}
            <input type="hidden" name="receiverId" value={$form.receiverId} />
          {/if}
        {/if}

        <!-- Hidden field for package type -->
        <input type="hidden" name="packageType" value={$form.packageType} />

        <!-- Hidden fields for order options -->
        <input type="hidden" name="orderType" value={$form.orderType} />
        <input type="hidden" name="goodsType" value={$form.goodsType} />
        <input type="hidden" name="packagingType" value={$form.packagingType} />
        <input type="hidden" name="vehicleType" value={$form.vehicleType} />
        <input type="hidden" name="actualWeight" value={$form.actualWeight} />
        <input type="hidden" name="paymentOption" value={$form.paymentOption} />

        {#if $form.distanceInKm !== undefined}
          <input type="hidden" name="distanceInKm" value={$form.distanceInKm} />
        {/if}
        {#if $form.estimatedTimeInMinutes !== undefined}
          <input
            type="hidden"
            name="estimatedTimeInMinutes"
            value={$form.estimatedTimeInMinutes}
          />
        {/if}

        {#if componentsOrder === 1}
          <div in:fade={fadeTransition} out:fade={{ duration: 200 }}>
            <SenderInfo
              {orderForm}
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
                  // Use serviceCity (normalized city name) if available, otherwise use city
                  const cityFromSender =
                    event.detail.senderInfo.serviceCity ||
                    event.detail.senderInfo.city;

                  if (cityFromSender) {
                    console.log(
                      "Setting originCity from sender:",
                      cityFromSender
                    );
                    $form.originCity = cityFromSender;
                  }
                }

                if (componentsOrder >= 1) {
                  componentsOrder += 1;
                }
              }}
            />
          </div>
        {:else if componentsOrder === 2}
          <div in:fade={fadeTransition} out:fade={{ duration: 200 }}>
            <ReceiverInfo
              {orderForm}
              {data}
              lat1={pickupLat}
              lng1={pickupLng}
              on:back={() => {
                if (componentsOrder > 1) {
                  componentsOrder -= 1;
                }
              }}
              on:next={handleReceiverInfoNext}
            />
          </div>
        {:else if componentsOrder === 3}
          <div in:fade={fadeTransition} out:fade={{ duration: 200 }}>
            <PackageTypeComponent
              {orderForm}
              on:select={(event) => {
                $form.packageType = event.detail;
                packageTemp = event.detail;
              }}
              on:next={() => {
                // Submit the form when user clicks  on package type
                console.log("Order created:", $form);
              }}
            />
          </div>
        {:else if componentsOrder === 4}
          <div
            in:fade={fadeTransition}
            out:fade={{ duration: 200 }}
            class="py-8"
          >
            <div
              class="max-w-2xl mx-auto bg-white rounded-lg shadow-lg overflow-hidden"
            >
              <!-- Header with celebration animation -->
              <div
                class="bg-gradient-to-r from-green-400 to-blue-500 p-6 text-white text-center relative overflow-hidden"
              >
                <!-- Confetti animation overlay -->
                <div class="absolute inset-0 z-0 opacity-30">
                  {#each Array(20) as _, i}
                    <div
                      class="absolute rounded-full"
                      style="
              width: {Math.random() * 12 + 5}px;
              height: {Math.random() * 12 + 5}px;
              background-color: #{Math.floor(Math.random() * 16777215).toString(
                        16
                      )};
              left: {Math.random() * 100}%;
              top: {Math.random() * 100}%;
              animation: confetti-fall {Math.random() * 3 +
                        2}s ease-in-out {Math.random() * 2}s infinite;
            "
                    ></div>
                  {/each}
                </div>

                <div class="relative z-10">
                  <div
                    class="inline-flex justify-center items-center w-20 h-20 bg-white rounded-full mb-4 shadow-lg"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-12 w-12 text-green-500"
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
                  </div>
                  <h2 class="text-2xl font-bold mb-2">
                    {completedOrderDetails?.paymentOption === "pay_now"
                      ? "Order Created - Payment Pending"
                      : "Order Successfully Created!"}
                  </h2>
                  <p class="text-white/90">
                    {completedOrderDetails?.paymentOption === "pay_now"
                      ? "Please complete your payment to process your shipment"
                      : "Your shipment is on its way to being processed"}
                  </p>
                </div>
              </div>

              <!-- Order details section -->
              <div class="p-6">
                <div
                  class="flex justify-between items-center mb-6 pb-4 border-b border-gray-100"
                >
                  <div>
                    <span class="text-xs font-medium text-gray-500"
                      >ORDER NUMBER</span
                    >
                    <p class="text-lg font-bold text-gray-800">
                      #{completedOrderId || "Processing..."}
                    </p>
                  </div>
                  <div class="bg-blue-100 px-3 py-1 rounded-full">
                    <span class="text-xs font-medium text-blue-800"
                      >Processing</span
                    >
                  </div>
                </div>

                <!-- Shipping information -->
                <div class="mb-6">
                  <h3 class="text-sm font-medium text-gray-700 mb-3">
                    Shipping Details
                  </h3>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="bg-gray-50 p-4 rounded-lg">
                      <div class="flex items-start mb-1">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-5 w-5 text-secondary mr-2 flex-shrink-0"
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
                        <div>
                          <span class="block text-xs text-gray-500">FROM</span>
                          <span class="font-medium text-gray-800"
                            >{completedOrderDetails?.userName}</span
                          >
                          <p class="text-sm text-gray-600 mt-0.5">
                            {completedOrderDetails?.pickUpLocation}
                          </p>
                          <p class="text-xs text-gray-500">
                            {completedOrderDetails?.phoneNumber}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div class="bg-gray-50 p-4 rounded-lg">
                      <div class="flex items-start mb-1">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-5 w-5 text-primary mr-2 flex-shrink-0"
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
                        <div>
                          <span class="block text-xs text-gray-500">TO</span>
                          <span class="font-medium text-gray-800"
                            >{completedOrderDetails?.receiverUsername}</span
                          >
                          <p class="text-sm text-gray-600 mt-0.5">
                            {completedOrderDetails?.dropOffLocation}
                          </p>
                          <p class="text-xs text-gray-500">
                            {completedOrderDetails?.receiverPhoneNumber}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Package and payment information -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div class="bg-gray-50 p-3 rounded-lg">
                    <span class="block text-xs text-gray-500">PACKAGE TYPE</span
                    >
                    <span class="font-medium text-gray-800"
                      >{completedOrderDetails?.packageType}</span
                    >
                    <p class="text-xs text-gray-600 mt-0.5">
                      {completedOrderDetails?.goodsType}, {completedOrderDetails?.actualWeight}kg
                    </p>
                  </div>

                  <div class="bg-gray-50 p-3 rounded-lg">
                    <span class="block text-xs text-gray-500"
                      >DELIVERY TYPE</span
                    >
                    <span class="font-medium text-gray-800"
                      >{completedOrderDetails?.orderType}</span
                    >
                    <p class="text-xs text-gray-600 mt-0.5">
                      {completedOrderDetails?.inCity === "0"
                        ? "In-city"
                        : "Between cities"}
                    </p>
                  </div>

                  <div
                    class={`bg-gray-50 p-3 rounded-lg ${completedOrderDetails?.paymentOption === "pay_now" ? "border-2 border-blue-500" : ""}`}
                  >
                    <span class="block text-xs text-gray-500">PAYMENT</span>
                    <span class="font-medium text-gray-800">
                      {completedOrderDetails?.paymentOption === "pay_on_pickup"
                        ? "Pay on pickup"
                        : completedOrderDetails?.paymentOption === "pay_now"
                          ? "Pay now"
                          : "Receiver pays"}
                    </span>
                    <p class="text-xs text-gray-600 mt-0.5">
                      {completedOrderDetails?.paymentOption === "pay_now"
                        ? "Payment pending - please complete payment"
                        : new Intl.NumberFormat("en-ET", {
                            style: "currency",
                            currency: "ETB",
                          }).format(pricingData.totalCost || 0)}
                    </p>
                  </div>
                </div>

                <!-- Timeline and next steps -->
                <div
                  class="bg-blue-50 p-4 rounded-lg border border-blue-100 mb-6"
                >
                  <h3 class="text-sm font-medium text-blue-800 mb-2">
                    What happens next?
                  </h3>
                  {#if completedOrderDetails?.paymentOption === "pay_now"}
                    <ol class="relative ml-6 text-sm">
                      <li class="mb-3 relative">
                        <div
                          class="absolute w-3 h-3 bg-blue-500 rounded-full -left-6 mt-1"
                        ></div>
                        <p class="text-gray-700">
                          <span class="font-medium">Complete Payment:</span> Finish
                          your payment in the payment window that opened.
                        </p>
                      </li>
                      <li class="mb-3 relative">
                        <div
                          class="absolute w-3 h-3 bg-gray-300 rounded-full -left-6 mt-1"
                        ></div>
                        <p class="text-gray-600">
                          <span class="font-medium">Order Processing:</span> After
                          payment, your order will be processed.
                        </p>
                      </li>
                      <li class="mb-3 relative">
                        <div
                          class="absolute w-3 h-3 bg-gray-300 rounded-full -left-6 mt-1"
                        ></div>
                        <p class="text-gray-600">
                          <span class="font-medium">Courier Assignment:</span> A
                          courier will be assigned to pick up your package.
                        </p>
                      </li>
                      <li class="relative">
                        <div
                          class="absolute w-3 h-3 bg-gray-300 rounded-full -left-6 mt-1"
                        ></div>
                        <p class="text-gray-600">
                          <span class="font-medium">Delivery:</span> Your package
                          will be delivered to the recipient.
                        </p>
                      </li>
                    </ol>
                  {:else}
                    <ol class="relative ml-6 text-sm">
                      <li class="mb-3 relative">
                        <div
                          class="absolute w-3 h-3 bg-blue-500 rounded-full -left-6 mt-1"
                        ></div>
                        <p class="text-gray-700">
                          <span class="font-medium">Order Processing:</span> We've
                          received your order and are preparing for pickup.
                        </p>
                      </li>
                      <li class="mb-3 relative">
                        <div
                          class="absolute w-3 h-3 bg-gray-300 rounded-full -left-6 mt-1"
                        ></div>
                        <p class="text-gray-600">
                          <span class="font-medium">Courier Assignment:</span> A
                          courier will be assigned to pick up your package.
                        </p>
                      </li>
                      <li class="mb-3 relative">
                        <div
                          class="absolute w-3 h-3 bg-gray-300 rounded-full -left-6 mt-1"
                        ></div>
                        <p class="text-gray-600">
                          <span class="font-medium">Pickup:</span> The courier will
                          arrive at the sender's location.
                        </p>
                      </li>
                      <li class="relative">
                        <div
                          class="absolute w-3 h-3 bg-gray-300 rounded-full -left-6 mt-1"
                        ></div>
                        <p class="text-gray-600">
                          <span class="font-medium">Delivery:</span> Your package
                          will be delivered to the recipient.
                        </p>
                      </li>
                    </ol>
                  {/if}
                </div>

                <!-- Action buttons -->
                <div
                  class="flex flex-col sm:flex-row gap-3 justify-between items-center"
                >
                  <a
                    href="/order-detail/{completedOrderId || ''}"
                    class="w-full sm:w-auto px-6 py-3 bg-primary text-white font-medium rounded-lg flex justify-center items-center hover:bg-primary-dark transition-colors"
                  >
                    Track Order
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-5 w-5 ml-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </a>

                  <div class="flex space-x-3">
                    <a
                      href="/all-orders"
                      class="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
                    >
                      View All Orders
                    </a>
                    <button
                      type="button"
                      on:click={() => resetOrderForm()}
                      class="px-4 py-2 bg-secondary text-white rounded-lg text-sm font-medium hover:bg-secondary-dark transition-colors flex items-center"
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
                          d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                        />
                      </svg>
                      Create New Order
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Order Summary and Payment Options -->
    {#if componentsOrder === 3 && packageTemp}
      <div
        class="mt-8 bg-white p-6 rounded-lg border border-gray-200 shadow-md"
        in:fly={{ y: 20, duration: 400, easing: cubicOut }}
      >
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-800">Order Summary</h3>
          <button
            type="button"
            class="text-secondary hover:text-secondary-dark font-medium text-sm"
            on:click={() => (showPriceBreakdown = !showPriceBreakdown)}
          >
            {showPriceBreakdown ? "Hide details" : "Show price breakdown"}
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div class="space-y-4">
            <div
              class="flex items-start space-x-3 pb-3 border-b border-gray-100"
            >
              <div class="bg-gray-100 rounded-full p-2 flex-shrink-0">
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
              <div class="flex-1 min-w-0">
                <span class="text-xs text-gray-500">From</span>
                <span class="block text-sm font-medium text-gray-800"
                  >{$form.userName}</span
                >
                <span class="block text-sm text-gray-600 truncate"
                  >{$form.pickUpLocation}</span
                >
              </div>
            </div>

            <div
              class="flex items-start space-x-3 pb-3 border-b border-gray-100"
            >
              <div class="bg-gray-100 rounded-full p-2 flex-shrink-0">
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
              <div class="flex-1 min-w-0">
                <span class="text-xs text-gray-500">To</span>
                <span class="block text-sm font-medium text-gray-800"
                  >{$form.receiverUsername}</span
                >
                <span class="block text-sm text-gray-600 truncate"
                  >{$form.dropOffLocation}</span
                >
              </div>
            </div>
          </div>

          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4 pb-3 border-b border-gray-100">
              <div>
                <span class="text-xs text-gray-500">Package Type</span>
                <span class="block text-sm font-medium text-gray-800"
                  >{$form.packageType}</span
                >
              </div>
              <div>
                <span class="text-xs text-gray-500">Delivery Type</span>
                <span class="block text-sm font-medium text-gray-800">
                  {$form.inCity === "0" ? "In City" : "Between Cities"}
                </span>
              </div>
              <div>
                <span class="text-xs text-gray-500">Delivery Speed</span>
                <span class="block text-sm font-medium text-gray-800">
                  {$form.orderType.replace("_", " ").toLowerCase()}
                </span>
              </div>
              <div>
                <span class="text-xs text-gray-500">Contents</span>
                <span class="block text-sm font-medium text-gray-800">
                  {$form.goodsType.replace("_", " ").toLowerCase()}
                </span>
              </div>
            </div>

            <!-- Show price breakdown if toggle is on -->
            {#if showPriceBreakdown && priceBreakdown}
              <div class="bg-gray-50 p-3 rounded-lg">
                <div class="space-y-1 text-sm">
                  <div class="flex justify-between">
                    <span class="text-gray-600">Shipping Cost:</span>
                    <span class="font-medium"
                      >{priceBreakdown.multipliedShippingCost.toFixed(2)} ETB</span
                    >
                  </div>

                  {#if priceBreakdown.packagingCost > 0}
                    <div class="flex justify-between">
                      <span class="text-gray-600">Packaging Fee:</span>
                      <span class="font-medium"
                        >{priceBreakdown.packagingCost.toFixed(2)} ETB</span
                      >
                    </div>
                  {/if}

                  {#if priceBreakdown.additionalFees && priceBreakdown.additionalFees.length > 0}
                    {#each priceBreakdown.additionalFees as fee}
                      <div class="flex justify-between">
                        <span class="text-gray-600">{fee.name}:</span>
                        <span class="font-medium"
                          >{fee.amount.toFixed(2)} ETB</span
                        >
                      </div>
                    {/each}
                  {/if}

                  <div class="border-t border-gray-200 my-1 pt-1"></div>
                </div>
              </div>
            {/if}
          </div>
        </div>

        <div class="bg-gray-50 p-4 rounded-lg">
          <div class="flex justify-between items-center">
            <div class="flex flex-col">
              <span class="text-gray-800 font-semibold">Total Price:</span>
              <span class="text-xs text-gray-500">All taxes included</span>
            </div>
            <span class="text-2xl font-bold text-secondary"
              >{estimatedPrice} ETB</span
            >
          </div>

          <!-- Action Buttons -->
          <div class="flex gap-4 mt-6">
            <button
              type="button"
              on:click={() => (componentsOrder = 2)}
              class="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              Back
            </button>

            <button
              type="submit"
              class="flex-1 bg-secondary text-white font-semibold py-3 px-6 rounded-lg hover:bg-secondary/90 transition-colors flex items-center justify-center group relative overflow-hidden"
              disabled={$submitting}
            >
              <span class="relative z-10 flex items-center">
                {#if $submitting}
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
                  Submit Order
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
      </div>
    {/if}
  </form>

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

<style>
  @keyframes shimmer {
    100% {
      transform: translateX(100%);
    }
  }

  .animate-shimmer {
    animation: shimmer 2s infinite;
  }

  /* Add confetti animation for celebration effect */
  @keyframes confetti-fall {
    0% {
      transform: translateY(-100%) rotate(0deg);
      opacity: 1;
    }
    100% {
      transform: translateY(100vh) rotate(360deg);
      opacity: 0;
    }
  }

  /* Add styles for disabled buttons */
  button:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }
</style>
