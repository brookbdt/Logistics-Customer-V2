<script lang="ts">
  import { type PriceBreakdown } from "$lib/utils/pricing";
  import type { CreateOrderFormInput } from "$lib/utils/schemas/create-order";
  import type { PackageType } from "@prisma/client";
  import { createEventDispatcher } from "svelte";
  import { backOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";
  import { superForm } from "sveltekit-superforms/client";

  let className = "";
  export { className as class };
  export let disableInput = false;

  // Use SuperForm instead of individual form properties
  export let orderForm: ReturnType<typeof superForm<CreateOrderFormInput>>;

  const { form, errors, enhance, constraints, message, submitting } = orderForm;

  // Create event dispatcher
  const dispatch = createEventDispatcher<{
    select: PackageType;
    next: undefined;
  }>();

  // Track form completion progress
  let showServiceOptions = false;
  let showPackageDetails = false;
  let showPaymentOptions = false;
  let showWeightOptions = false;

  // Show options after short animation delay when package is selected
  $: if ($form.packageType) {
    setTimeout(() => {
      showServiceOptions = true;
    }, 300);
  }

  $: if (showServiceOptions && $form.orderType && $form.goodsType) {
    setTimeout(() => {
      showPackageDetails = true;
    }, 300);
  }

  $: if (showPackageDetails && $form.packagingType) {
    setTimeout(() => {
      showWeightOptions = true;
    }, 300);
  }

  $: if (showWeightOptions && $form.actualWeight > 0) {
    setTimeout(() => {
      showPaymentOptions = true;
    }, 300);
  }

  // Package type descriptions
  const packageDescriptions = {
    PARCEL: {
      title: "Parcel",
      description: "Small to medium-sized packages up to 20kg",
      icon: "📦",
      examples: "Documents, small electronics, clothing",
    },
    PALLET: {
      title: "Pallet",
      description: "Larger shipments secured on a pallet",
      icon: "🔧",
      examples: "Multiple boxes, furniture, equipment",
    },
  };

  // Handle package selection
  function selectPackage(type: string) {
    $form.packageType = type as PackageType;

    // Set default vehicle type based on package type
    if (type === "PALLET") {
      $form.vehicleType = "CAR"; // Default to CAR for pallets
    }

    // Dispatch the select event with the package type
    dispatch("select", type as PackageType);
    // Reset following sections if package type changes
    showServiceOptions = false;
    showPackageDetails = false;
    showWeightOptions = false;
    showPaymentOptions = false;
    setTimeout(() => {
      showServiceOptions = true;
    }, 500);
  }
</script>

<div class="{className} space-y-6" in:fade={{ duration: 300 }}>
  <div class="mb-4">
    <h2 class="text-xl font-bold text-gray-800 mb-2">Package Details</h2>
    <p class="text-gray-600 text-sm">
      Select the type of package you're sending
    </p>
  </div>

  <!-- Package Type Selection - Smaller, More Elegant Buttons -->
  <div class="grid grid-cols-2 gap-4 max-w-md mx-auto">
    {#each Object.entries(packageDescriptions) as [type, details]}
      <button
        type="button"
        disabled={disableInput}
        class="text-left p-4 border rounded-xl transition-all relative {$form.packageType ===
        type
          ? 'border-secondary bg-secondary/5 shadow-md transform scale-105'
          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}"
        on:click={() => selectPackage(type)}
      >
        <div class="flex flex-col h-full">
          <div class="text-2xl mb-2">{details.icon}</div>
          <h3 class="font-semibold text-gray-800 text-sm md:text-base">
            {details.title}
          </h3>
          <p class="text-xs md:text-sm text-gray-600 mt-1 mb-2">
            {details.description}
          </p>
          <p class="text-xs text-gray-500 mt-auto">
            Examples: {details.examples}
          </p>

          {#if $form.packageType === type}
            <div class="absolute top-2 right-2">
              <div class="bg-secondary text-white rounded-full p-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-3 w-3"
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
            </div>
          {/if}
        </div>
      </button>
    {/each}
  </div>

  <!-- Incremental Form Sections - Only Show When Package Type Selected -->
  {#if $form.packageType}
    <!-- Service Options Section -->
    {#if showServiceOptions}
      <div
        in:fly={{ y: 20, duration: 400, delay: 200, easing: backOut }}
        class="mt-8 bg-white p-5 rounded-lg border border-gray-200 shadow-sm"
      >
        <h3 class="text-sm font-medium text-gray-700 mb-4 flex items-center">
          <span
            class="bg-secondary text-white text-xs rounded-full w-5 h-5 inline-flex items-center justify-center mr-2"
            >1</span
          >
          Service Options
        </h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label for="orderType" class="block text-xs text-gray-500 mb-1"
              >Delivery Speed</label
            >
            <select
              id="orderType"
              bind:value={$form.orderType}
              class="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"
            >
              <option value="STANDARD">Standard</option>
              <option value="EXPRESS">Express</option>
              <option value="SAME_DAY">Same Day</option>
            </select>
          </div>
          <div>
            <label for="goodsType" class="block text-xs text-gray-500 mb-1"
              >Goods Type</label
            >
            <select
              id="goodsType"
              bind:value={$form.goodsType}
              class="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"
            >
              <option value="NORMAL">Normal</option>
              <option value="SPECIAL_CARE">Special Care</option>
            </select>
          </div>
        </div>
      </div>
    {/if}

    <!-- Packaging Options Section -->
    {#if showPackageDetails}
      <div
        in:fly={{ y: 20, duration: 400, delay: 200, easing: backOut }}
        class="mt-3 bg-white p-5 rounded-lg border border-gray-200 shadow-sm"
      >
        <h3 class="text-sm font-medium text-gray-700 mb-4 flex items-center">
          <span
            class="bg-secondary text-white text-xs rounded-full w-5 h-5 inline-flex items-center justify-center mr-2"
            >2</span
          >
          Packaging
        </h3>

        <div>
          <label for="packagingType" class="block text-xs text-gray-500 mb-1"
            >Packaging Type</label
          >
          <select
            id="packagingType"
            bind:value={$form.packagingType}
            class="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"
          >
            <option value="STANDARD_BOX">Standard Box</option>
            <!-- Hidden until premium features are well defined -->
            <!-- <option value="PREMIUM_BOX">Premium Box</option> -->
            <option value="SPECIALTY">Specialty Packaging</option>
            <option value="CUSTOM">Custom Packaging</option>
          </select>
          <p class="text-xs text-gray-500 mt-1">
            Choose the best packaging option for your item's protection
          </p>
        </div>

        {#if $form.packageType === "PARCEL"}
          <div class="mt-4">
            <label for="vehicleType" class="block text-xs text-gray-500 mb-1"
              >Preferred Vehicle</label
            >
            <select
              id="vehicleType"
              bind:value={$form.vehicleType}
              class="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"
            >
              <option value="BIKE">Bike (Small parcels)</option>
              <option value="CAR">Car (Medium parcels)</option>
              <option value="TRUCK">Truck (Large parcels)</option>
            </select>
          </div>
        {:else if $form.packageType === "PALLET"}
          <div
            class="mt-4 bg-blue-50 p-3 rounded-lg border border-blue-100 flex items-center"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5 text-blue-500 mr-2 flex-shrink-0"
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
            <div>
              <p class="text-sm text-blue-800 font-medium">
                Car assigned for delivery
              </p>
              <p class="text-xs text-blue-600">
                For pallet shipments, we automatically assign a car for safe
                transport
              </p>
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Weight & Dimensions Section -->
    {#if showWeightOptions}
      <div
        in:fly={{ y: 20, duration: 400, delay: 200, easing: backOut }}
        class="mt-3 bg-white p-5 rounded-lg border border-gray-200 shadow-sm"
      >
        <h3 class="text-sm font-medium text-gray-700 mb-4 flex items-center">
          <span
            class="bg-secondary text-white text-xs rounded-full w-5 h-5 inline-flex items-center justify-center mr-2"
            >3</span
          >
          Weight & Dimensions
        </h3>

        <div>
          <label for="actualWeight" class="block text-xs text-gray-500 mb-1">
            Actual Weight (kg)
          </label>
          <input
            id="actualWeight"
            type="number"
            min="0.1"
            step="0.1"
            bind:value={$form.actualWeight}
            class="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"
          />
        </div>

        <div class="grid grid-cols-3 gap-3 mt-3">
          <div>
            <label for="length" class="block text-xs text-gray-500 mb-1"
              >Length (cm)</label
            >
            <input
              id="length"
              type="number"
              min="1"
              bind:value={$form.length}
              class="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"
            />
          </div>
          <div>
            <label for="width" class="block text-xs text-gray-500 mb-1"
              >Width (cm)</label
            >
            <input
              id="width"
              type="number"
              min="1"
              bind:value={$form.width}
              class="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"
            />
          </div>
          <div>
            <label for="height" class="block text-xs text-gray-500 mb-1"
              >Height (cm)</label
            >
            <input
              id="height"
              type="number"
              min="1"
              bind:value={$form.height}
              class="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"
            />
          </div>
        </div>
      </div>
    {/if}

    <!-- Payment Options Section -->
    {#if showPaymentOptions}
      <div
        in:fly={{ y: 20, duration: 400, delay: 200, easing: backOut }}
        class="mt-3 bg-white p-5 rounded-lg border border-gray-200 shadow-sm"
      >
        <h3 class="text-sm font-medium text-gray-700 mb-4 flex items-center">
          <span
            class="bg-secondary text-white text-xs rounded-full w-5 h-5 inline-flex items-center justify-center mr-2"
            >4</span
          >
          Payment Options
        </h3>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <!-- Pay on Pickup Option -->
          <label
            class="flex flex-col sm:flex-row items-start h-full p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition-all duration-200
            {$form.paymentOption === 'pay_on_pickup'
              ? 'border-secondary bg-secondary/5 shadow-md transform scale-[1.02]'
              : 'border-gray-200'}"
          >
            <div class="flex items-start">
              <input
                type="radio"
                name="paymentOption"
                value="pay_on_pickup"
                bind:group={$form.paymentOption}
                class="mt-1 text-secondary focus:ring-secondary"
              />
              <div class="ml-3 flex-1">
                <div class="flex flex-wrap items-center gap-2 mb-1">
                  <span class="font-medium text-gray-900">Pay on Pickup</span>
                  <span
                    class="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full whitespace-nowrap"
                    >Recommended</span
                  >
                </div>
                <p class="text-xs text-gray-500">
                  Pay the driver when they arrive to collect your package
                </p>
              </div>
            </div>
            {#if $form.paymentOption === "pay_on_pickup"}
              <div class="hidden sm:flex items-center justify-center ml-auto">
                <div class="bg-secondary text-white rounded-full p-1">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
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
              </div>
            {/if}
          </label>

          <!-- Pay on Delivery -->
          <label
            class="flex flex-col sm:flex-row items-start h-full p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition-all duration-200
            {$form.paymentOption === 'pay_on_delivery'
              ? 'border-secondary bg-secondary/5 shadow-md transform scale-[1.02]'
              : 'border-gray-200'}"
          >
            <div class="flex items-start">
              <input
                type="radio"
                name="paymentOption"
                value="pay_on_delivery"
                bind:group={$form.paymentOption}
                class="mt-1 text-secondary focus:ring-secondary"
              />
              <div class="ml-3 flex-1">
                <span class="font-medium text-gray-900 block mb-1"
                  >Receiver Pays on Delivery</span
                >
                <p class="text-xs text-gray-500">
                  The recipient will pay when the package is delivered
                </p>
              </div>
            </div>
            {#if $form.paymentOption === "pay_on_delivery"}
              <div class="hidden sm:flex items-center justify-center ml-auto">
                <div class="bg-secondary text-white rounded-full p-1">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
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
              </div>
            {/if}
          </label>

          <!-- Pay Now Option -->
          <label
            class="flex flex-col sm:flex-row items-start h-full p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition-all duration-200
            {$form.paymentOption === 'pay_now'
              ? 'border-secondary bg-secondary/5 shadow-md transform scale-[1.02]'
              : 'border-gray-200'}"
          >
            <div class="flex items-start">
              <input
                type="radio"
                name="paymentOption"
                value="pay_now"
                bind:group={$form.paymentOption}
                class="mt-1 text-secondary focus:ring-secondary"
              />
              <div class="ml-3 flex-1">
                <span class="font-medium text-gray-900 block mb-1"
                  >Pay Now Online</span
                >
                <p class="text-xs text-gray-500">
                  Pay immediately using card or mobile payment
                </p>
              </div>
            </div>
            {#if $form.paymentOption === "pay_now"}
              <div class="hidden sm:flex items-center justify-center ml-auto">
                <div class="bg-secondary text-white rounded-full p-1">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
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
              </div>
            {/if}
          </label>
        </div>

        <!-- Payment method explanation -->
        <div
          class="mt-4 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100"
        >
          <div class="flex">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5 text-gray-500 mr-2 flex-shrink-0"
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
            <p class="text-xs text-gray-600">
              {#if $form.paymentOption === "pay_on_pickup"}
                You'll pay the driver directly when they arrive to pick up your
                package. We accept cash and mobile payments.
              {:else if $form.paymentOption === "pay_on_delivery"}
                The recipient will need to pay for the delivery when they
                receive the package. Make sure they're informed.
              {:else if $form.paymentOption === "pay_now"}
                You'll be directed to our secure payment gateway after placing
                your order. We accept debit/credit cards, Telebirr, and bank
                transfers.
              {/if}
            </p>
          </div>
        </div>

        <!-- Payment Method Icons - Only show for Pay Now option -->
        {#if $form.paymentOption === "pay_now"}
          <div class="mt-4 flex flex-wrap justify-center gap-2">
            <div
              class="bg-white p-2 rounded-lg border border-gray-200 flex items-center shadow-sm"
            >
              <span class="text-xs font-medium text-gray-700 mx-2">Visa</span>
            </div>
            <div
              class="bg-white p-2 rounded-lg border border-gray-200 flex items-center shadow-sm"
            >
              <span class="text-xs font-medium text-gray-700 mx-2"
                >MasterCard</span
              >
            </div>
            <div
              class="bg-white p-2 rounded-lg border border-gray-200 flex items-center shadow-sm"
            >
              <span class="text-xs font-medium text-gray-700 mx-2"
                >Telebirr</span
              >
            </div>
            <div
              class="bg-white p-2 rounded-lg border border-gray-200 flex items-center shadow-sm"
            >
              <span class="text-xs font-medium text-gray-700 mx-2">CBE</span>
            </div>
          </div>
        {/if}

        <!-- Completion Animation - More responsive and elegant -->
        <div
          in:fly={{ y: 20, duration: 400, delay: 400, easing: backOut }}
          class="mt-6 text-center px-4 py-6 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-100"
        >
          <div
            class="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-r from-green-400 to-green-500 text-white mb-3 shadow-md"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-7 w-7"
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
          <h3 class="text-lg font-medium text-gray-800 mb-1">
            Ready for Shipping!
          </h3>
          <p class="text-sm text-gray-600 max-w-md mx-auto">
            You've completed all the necessary details. Review your order
            summary and continue to finalize your shipment.
          </p>
        </div>
      </div>
    {/if}
  {/if}

  {#if !$form.packageType}
    <div
      class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-800 mt-6"
    >
      <div class="flex items-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-5 w-5 mr-2 text-blue-500"
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
        <p class="text-sm">
          Please select a package type to continue building your shipment
        </p>
      </div>
    </div>
  {/if}
</div>
