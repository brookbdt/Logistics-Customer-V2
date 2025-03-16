<script lang="ts">
  import { enhance } from "$app/forms";
  import Add from "$lib/assets/shared/add.svg.svelte";
  import CustomerSupport from "$lib/assets/shared/customer-support.svg.svelte";
  import Image from "$lib/assets/shared/image.svg.svelte";
  import Search from "$lib/assets/shared/search.svg.svelte";
  import dayJs from "dayjs";
  import { clickOutside } from "$lib/utils/click-outside.js";
  import { toast } from "@zerodevx/svelte-toast";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { superForm } from "sveltekit-superforms/client";
  import { slide, fade } from "svelte/transition";

  export let data;
  $: console.log({ data });
  export let form;

  // Order search functionality
  let searchDisplay = false;
  $: form?.orderFound ? (searchDisplay = true) : (searchDisplay = false);
  let displayedComponent: "incoming" | "outgoing" = "outgoing";

  // Pricing calculator
  const {
    form: pricingForm,
    enhance: pricingEnhance,
    constraints,
  } = superForm(data.form);
  let showPricingCalculator = false;
  let calculatedPrice = null;
  let priceBreakdown = null;

  // Dimensional weight calculation
  $: dimensionalWeight =
    $pricingForm.length && $pricingForm.width && $pricingForm.height
      ? ($pricingForm.length * $pricingForm.width * $pricingForm.height) / 5000
      : 0;

  // Determine which weight to use
  $: effectiveWeight = Math.max(
    $pricingForm.actualWeight || 0,
    dimensionalWeight || 0
  );

  // Calculate shipping cost
  function calculatePrice() {
    try {
      let baseShippingCost = 0;
      let packagingCost = 0;
      let additionalFees = [];

      // Get customer type multiplier
      const customerTypeMultiplier =
        data.pricingConfig.multipliers.customerType[
          data.customer?.customerType || "INDIVIDUAL"
        ] || 1;

      // Get order type multiplier
      const orderTypeMultiplier =
        data.pricingConfig.multipliers.orderType[$pricingForm.orderType] || 1;

      // Get goods type multiplier
      const goodsTypeMultiplier =
        data.pricingConfig.multipliers.goodsType[$pricingForm.goodsType] || 1;

      // Get premium type multiplier if customer has premium status
      let premiumTypeMultiplier = 1;
      if (data.customer?.premium && data.pricingConfig.premiumTypes) {
        const premiumType = `PREMIUM_${data.customer.customerType || "INDIVIDUAL"}`;
        premiumTypeMultiplier =
          data.pricingConfig.premiumTypes[premiumType] || 1;
      }

      // Get packaging fee
      packagingCost =
        data.pricingConfig.packagingFees[$pricingForm.packagingType] || 0;

      if ($pricingForm.isInCity) {
        // In-city pricing
        const cityPricing =
          data.pricingConfig.inCityPricing[$pricingForm.originCity];
        if (!cityPricing) {
          throw new Error(
            `No in-city pricing found for ${$pricingForm.originCity}`
          );
        }

        // Base fare
        baseShippingCost = cityPricing.baseFare;

        // Add distance charge (if over 2km)
        const distance = $pricingForm.distance || 0;
        if (distance > 2) {
          baseShippingCost += (distance - 2) * cityPricing.distanceCharge;
        }

        // Add time charge (if over 5 minutes)
        const time = $pricingForm.estimatedTime || 0;
        if (time > 5) {
          baseShippingCost += (time - 5) * cityPricing.timeCharge;
        }

        // Apply vehicle type multiplier
        if ($pricingForm.vehicleType) {
          const vehicleMultiplier =
            data.pricingConfig.vehicleTypes[$pricingForm.originCity]?.[
              $pricingForm.vehicleType
            ] || 1;
          baseShippingCost *= vehicleMultiplier;
        }

        // Get additional fees for the city
        if (data.pricingConfig.additionalFees[$pricingForm.originCity]) {
          additionalFees =
            data.pricingConfig.additionalFees[$pricingForm.originCity];
        }
      } else {
        // Between cities pricing
        const unitRate =
          data.pricingConfig.pricingMatrix[$pricingForm.originCity]?.[
            $pricingForm.destinationCity
          ];
        if (!unitRate) {
          throw new Error(
            `No pricing found for route from ${$pricingForm.originCity} to ${$pricingForm.destinationCity}`
          );
        }

        // Calculate base shipping cost
        baseShippingCost = unitRate * effectiveWeight;

        // Get additional fees for the origin city
        if (data.pricingConfig.additionalFees[$pricingForm.originCity]) {
          additionalFees =
            data.pricingConfig.additionalFees[$pricingForm.originCity];
        }
      }

      // Apply multipliers
      const multipliedShippingCost =
        baseShippingCost *
        customerTypeMultiplier *
        orderTypeMultiplier *
        goodsTypeMultiplier *
        premiumTypeMultiplier;

      // Calculate total additional fees
      const totalAdditionalFees = additionalFees.reduce(
        (sum, fee) => sum + fee.amount,
        0
      );

      // Calculate total cost
      const totalCost =
        multipliedShippingCost + packagingCost + totalAdditionalFees;

      // Create price breakdown
      priceBreakdown = {
        baseShippingCost,
        effectiveWeight,
        customerTypeMultiplier,
        orderTypeMultiplier,
        goodsTypeMultiplier,
        multipliedShippingCost,
        packagingCost,
        additionalFees,
        totalAdditionalFees,
        totalCost,
        premiumTypeMultiplier,
      };

      calculatedPrice = totalCost;
    } catch (error) {
      toast.push({
        message: error.message,
        theme: {
          "--toastBackground": "#F56565",
          "--toastBarBackground": "#C53030",
        },
      });
      calculatedPrice = null;
      priceBreakdown = null;
    }
  }

  // Reset calculator
  function resetCalculator() {
    $pricingForm = {
      originCity: "",
      destinationCity: "",
      isInCity: false,
      actualWeight: 0.1,
      length: undefined,
      width: undefined,
      height: undefined,
      orderType: "STANDARD",
      goodsType: "NORMAL",
      packagingType: "STANDARD_BOX",
      distance: undefined,
      estimatedTime: undefined,
      vehicleType: undefined,
    };
    calculatedPrice = null;
    priceBreakdown = null;
  }
</script>

<div class="w-full grid items-center justify-center">
  <!-- Hero section with gradient background -->
  <div
    class="w-full bg-gradient-to-r from-secondary/90 to-primary/90 text-white py-6 px-4 mb-6"
  >
    <div class="max-w-md mx-auto">
      <h1 class="text-2xl font-bold mb-2">Fast, Reliable Delivery</h1>
      <p class="text-sm mb-4">Ship your packages anywhere with confidence</p>

      <div class="flex gap-3 mt-4">
        <a href="/create-order" class="flex-1">
          <button
            class="w-full bg-white text-secondary font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 shadow-lg hover:bg-gray-100 transition-all"
          >
            <Add class="w-5 h-5" /> New Order
          </button>
        </a>
        <button
          on:click={() => (showPricingCalculator = !showPricingCalculator)}
          class="flex-1 bg-black/20 backdrop-blur-sm border border-white/30 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 hover:bg-black/30 transition-all"
        >
          <Add class="w-5 h-5" /> Calculate Price
        </button>
      </div>
    </div>
  </div>

  <!-- Main content container -->
  <div class="mx-auto w-full max-w-md px-4">
    <!-- Search bar -->
    <label
      class="border-[1px] border-grayInput rounded-lg h-12 mb-6 px-4 flex items-center justify-start shadow-sm"
    >
      <Search class="w-4 h-4 mr-4 text-gray-500" />
      <input
        class="w-full focus:outline-none focus:shadow-outline"
        placeholder="Search Order by ID"
        name="orderId"
        type="number"
        on:change={async (e) => {
          const newSearchParams = new URLSearchParams($page.url.search);
          newSearchParams.set("searchOrder", e.currentTarget.value);
          await goto(`?${newSearchParams.toString()}`);
        }}
      />
    </label>

    <!-- Pricing Calculator (Collapsible) -->
    {#if showPricingCalculator}
      <div
        transition:slide={{ duration: 300 }}
        class="bg-white rounded-xl shadow-md p-5 mb-6 border border-gray-200"
      >
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-lg font-semibold text-gray-800">
            Shipping Price Calculator
          </h2>
          <button
            on:click={() => (showPricingCalculator = false)}
            class="text-gray-500 hover:text-gray-700"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form class="space-y-4">
          <!-- Shipping Type Toggle -->
          <div class="flex bg-gray-100 p-1 rounded-lg mb-4">
            <button
              type="button"
              class="flex-1 py-2 px-3 rounded-md text-sm font-medium {!$pricingForm.isInCity
                ? 'bg-white shadow-sm'
                : 'text-gray-600'}"
              on:click={() => ($pricingForm.isInCity = false)}
            >
              Between Cities
            </button>
            <button
              type="button"
              class="flex-1 py-2 px-3 rounded-md text-sm font-medium {$pricingForm.isInCity
                ? 'bg-white shadow-sm'
                : 'text-gray-600'}"
              on:click={() => ($pricingForm.isInCity = true)}
            >
              Within City
            </button>
          </div>

          <!-- Location Section -->
          <div class="space-y-3">
            <h3 class="text-sm font-medium text-gray-700">Location</h3>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="originCity" class="block text-xs text-gray-500 mb-1"
                  >Origin City</label
                >
                <select
                  id="originCity"
                  bind:value={$pricingForm.originCity}
                  class="w-full p-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">Select city</option>
                  {#each data.pricingConfig.cities as city}
                    <option value={city}>{city}</option>
                  {/each}
                </select>
              </div>

              {#if !$pricingForm.isInCity}
                <div>
                  <label
                    for="destinationCity"
                    class="block text-xs text-gray-500 mb-1"
                    >Destination City</label
                  >
                  <select
                    id="destinationCity"
                    bind:value={$pricingForm.destinationCity}
                    class="w-full p-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">Select city</option>
                    {#each data.pricingConfig.cities as city}
                      <option value={city}>{city}</option>
                    {/each}
                  </select>
                </div>
              {/if}
            </div>

            <!-- In-city specific fields -->
            {#if $pricingForm.isInCity}
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label for="distance" class="block text-xs text-gray-500 mb-1"
                    >Distance (km)</label
                  >
                  <input
                    id="distance"
                    type="number"
                    min="0.1"
                    step="0.1"
                    bind:value={$pricingForm.distance}
                    class="w-full p-2 border border-gray-300 rounded-md text-sm"
                  />
                </div>
                <div>
                  <label
                    for="estimatedTime"
                    class="block text-xs text-gray-500 mb-1"
                    >Est. Time (min)</label
                  >
                  <input
                    id="estimatedTime"
                    type="number"
                    min="1"
                    step="1"
                    bind:value={$pricingForm.estimatedTime}
                    class="w-full p-2 border border-gray-300 rounded-md text-sm"
                  />
                </div>
              </div>

              <div>
                <label
                  for="vehicleType"
                  class="block text-xs text-gray-500 mb-1">Vehicle Type</label
                >
                <select
                  id="vehicleType"
                  bind:value={$pricingForm.vehicleType}
                  class="w-full p-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">Select vehicle</option>
                  <option value="BIKE">Bike</option>
                  <option value="CAR">Car</option>
                  <option value="TRUCK">Truck</option>
                </select>
              </div>
            {/if}
          </div>

          <!-- Package Details Section -->
          <div class="space-y-3">
            <h3 class="text-sm font-medium text-gray-700">Package Details</h3>

            <div>
              <label for="actualWeight" class="block text-xs text-gray-500 mb-1"
                >Actual Weight (kg)</label
              >
              <input
                id="actualWeight"
                type="number"
                min="0.1"
                step="0.1"
                bind:value={$pricingForm.actualWeight}
                class="w-full p-2 border border-gray-300 rounded-md text-sm"
              />
            </div>

            <div class="grid grid-cols-3 gap-3">
              <div>
                <label for="length" class="block text-xs text-gray-500 mb-1"
                  >Length (cm)</label
                >
                <input
                  id="length"
                  type="number"
                  min="1"
                  bind:value={$pricingForm.length}
                  class="w-full p-2 border border-gray-300 rounded-md text-sm"
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
                  bind:value={$pricingForm.width}
                  class="w-full p-2 border border-gray-300 rounded-md text-sm"
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
                  bind:value={$pricingForm.height}
                  class="w-full p-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>

            {#if $pricingForm.length && $pricingForm.width && $pricingForm.height}
              <div class="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                Dimensional weight: <span class="font-medium"
                  >{dimensionalWeight.toFixed(2)} kg</span
                >
                <br />
                <span class="text-xs text-gray-500"
                  >(We'll use the greater of actual or dimensional weight)</span
                >
              </div>
            {/if}
          </div>

          <!-- Service Options Section -->
          <div class="space-y-3">
            <h3 class="text-sm font-medium text-gray-700">Service Options</h3>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="orderType" class="block text-xs text-gray-500 mb-1"
                  >Delivery Speed</label
                >
                <select
                  id="orderType"
                  bind:value={$pricingForm.orderType}
                  class="w-full p-2 border border-gray-300 rounded-md text-sm"
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
                  bind:value={$pricingForm.goodsType}
                  class="w-full p-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="NORMAL">Normal</option>
                  <option value="SPECIAL_CARE">Special Care</option>
                </select>
              </div>
            </div>

            <div>
              <label
                for="packagingType"
                class="block text-xs text-gray-500 mb-1">Packaging Type</label
              >
              <select
                id="packagingType"
                bind:value={$pricingForm.packagingType}
                class="w-full p-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="STANDARD_BOX">Standard Box</option>
                <option value="PREMIUM_BOX">Premium Box</option>
                <option value="SPECIALTY_PACKAGING">Specialty Packaging</option>
                <option value="CUSTOM_PACKAGING">Custom Packaging</option>
              </select>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="flex gap-3 pt-2">
            <button
              type="button"
              on:click={calculatePrice}
              class="flex-1 bg-secondary text-white font-medium py-3 rounded-lg hover:bg-secondary/90 transition-colors"
            >
              Calculate Price
            </button>
            <button
              type="button"
              on:click={resetCalculator}
              class="px-4 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Reset
            </button>
          </div>
        </form>

        <!-- Price Result -->
        {#if calculatedPrice !== null}
          <div
            transition:fade={{ duration: 200 }}
            class="mt-6 border-t border-gray-200 pt-4"
          >
            <div class="bg-gray-50 p-4 rounded-lg">
              <div class="flex justify-between items-center mb-3">
                <h3 class="text-sm font-medium text-gray-700">
                  Price Estimate
                </h3>
                <span class="text-xl font-bold text-secondary"
                  >{calculatedPrice.toFixed(2)}</span
                >
              </div>

              <!-- Price Breakdown -->
              <div class="space-y-2 text-sm">
                <div class="flex justify-between">
                  <span class="text-gray-600">Base shipping cost:</span>
                  <span>{priceBreakdown.baseShippingCost.toFixed(2)}</span>
                </div>

                {#if !$pricingForm.isInCity}
                  <div class="flex justify-between">
                    <span class="text-gray-600"
                      >Weight factor ({priceBreakdown.effectiveWeight.toFixed(
                        2
                      )} kg):</span
                    >
                    <span>× {priceBreakdown.effectiveWeight.toFixed(2)}</span>
                  </div>
                {/if}

                <div class="flex justify-between">
                  <span class="text-gray-600">Customer type:</span>
                  <span
                    >× {priceBreakdown.customerTypeMultiplier.toFixed(2)}</span
                  >
                </div>

                <div class="flex justify-between">
                  <span class="text-gray-600">Order type:</span>
                  <span>× {priceBreakdown.orderTypeMultiplier.toFixed(2)}</span>
                </div>

                <div class="flex justify-between">
                  <span class="text-gray-600">Goods type:</span>
                  <span>× {priceBreakdown.goodsTypeMultiplier.toFixed(2)}</span>
                </div>

                {#if priceBreakdown.premiumTypeMultiplier && priceBreakdown.premiumTypeMultiplier !== 1}
                  <div class="flex justify-between">
                    <span class="text-gray-600">Premium status:</span>
                    <span
                      >× {priceBreakdown.premiumTypeMultiplier.toFixed(2)}</span
                    >
                  </div>
                {/if}

                <div class="flex justify-between font-medium">
                  <span class="text-gray-700">Shipping subtotal:</span>
                  <span>{priceBreakdown.multipliedShippingCost.toFixed(2)}</span
                  >
                </div>

                <div class="flex justify-between">
                  <span class="text-gray-600">Packaging fee:</span>
                  <span>{priceBreakdown.packagingCost.toFixed(2)}</span>
                </div>

                {#if priceBreakdown.additionalFees.length > 0}
                  {#each priceBreakdown.additionalFees as fee}
                    <div class="flex justify-between">
                      <span class="text-gray-600">{fee.name}:</span>
                      <span>{fee.amount.toFixed(2)}</span>
                    </div>
                  {/each}
                {/if}

                <div
                  class="flex justify-between font-bold pt-2 border-t border-gray-200 mt-2"
                >
                  <span>Total:</span>
                  <span>{priceBreakdown.totalCost.toFixed(2)}</span>
                </div>
              </div>

              <!-- Create Order Button -->
              <a href="/create-order" class="block mt-4">
                <button
                  class="w-full bg-secondary text-white font-semibold py-3 rounded-lg hover:bg-secondary/90 transition-colors flex items-center justify-center gap-2"
                >
                  <Add class="w-5 h-5" /> Create Order Now
                </button>
              </a>
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Customer Support Button -->
    <a href="/support">
      <div
        class="bg-black mb-6 flex gap-3 px-6 w-full justify-center items-center rounded-xl h-12 text-white shadow-sm hover:bg-gray-800 transition-colors"
      >
        <CustomerSupport /> Customer Support
      </div>
    </a>

    <!-- Order History Section -->
    <div class="bg-white rounded-xl shadow-md overflow-hidden mb-6">
      <div class="flex w-full bg-primary/10 p-2">
        <button
          class="w-full"
          on:click={() => (displayedComponent = "outgoing")}
        >
          <p
            class="py-2 px-3 rounded-md text-sm font-medium transition-colors {displayedComponent ===
            'outgoing'
              ? 'bg-white shadow-sm'
              : 'text-gray-600 hover:bg-white/50'} "
          >
            Outgoing
          </p>
        </button>
        <button
          class="w-full"
          on:click={() => (displayedComponent = "incoming")}
        >
          <p
            class="py-2 px-3 rounded-md text-sm font-medium transition-colors {displayedComponent ===
            'incoming'
              ? 'bg-white shadow-sm'
              : 'text-gray-600 hover:bg-white/50'}"
          >
            Incoming
          </p>
        </button>
      </div>

      <div class="p-4">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-lg font-semibold text-gray-800">Order History</h2>
          <a
            href="/create-order"
            class="text-secondary text-sm font-medium hover:underline"
            >+ New Order</a
          >
        </div>

        {#if displayedComponent === "outgoing"}
          {#if data.myOrders.filter((order) => order.senderCustomerId === data.session?.customerData.id).length === 0}
            <div class="py-8 text-center">
              <p class="text-gray-500 mb-4">
                You haven't sent any packages yet
              </p>
              <a href="/create-order" class="inline-block">
                <button
                  class="bg-secondary text-white font-medium py-2 px-4 rounded-lg hover:bg-secondary/90 transition-colors"
                >
                  Send Your First Package
                </button>
              </a>
            </div>
          {:else}
            {#each data.myOrders as order}
              {#if order.senderCustomerId === data.session?.customerData.id}
                <a
                  href="/order-detail/{order.id}"
                  class="block transition-transform hover:scale-[1.01]"
                >
                  <div
                    class="bg-gray-50 px-4 py-4 shadow-sm border border-gray-100 my-3 rounded-lg hover:shadow-md transition-shadow"
                  >
                    <div class="flex justify-between items-start mb-2">
                      <p class="text-gray-800 font-bold">
                        Order #{order.id}
                      </p>
                      <div class="flex items-center">
                        <span
                          class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                          {order.orderStatus === 'UNCLAIMED'
                            ? 'bg-yellow-100 text-yellow-800'
                            : order.orderStatus === 'CLAIMED'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-green-100 text-green-800'}"
                        >
                          {order.orderStatus.toLowerCase()}
                        </span>
                      </div>
                    </div>

                    <div class="space-y-1 mb-2">
                      <div class="flex items-start">
                        <span class="text-gray-500 w-16">From:</span>
                        <div class="flex-1">
                          <span class="font-medium text-gray-800"
                            >{order.Sender.User.userName}</span
                          >
                          <span class="text-sm text-gray-500 block">
                            {order.pickUpPhysicalLocation}
                          </span>
                        </div>
                      </div>

                      <div class="flex items-start">
                        <span class="text-gray-500 w-16">To:</span>
                        <div class="flex-1">
                          <span class="font-medium text-gray-800">
                            {order.receiverName
                              ? order.receiverName
                              : order.Receiver?.User.userName}
                          </span>
                          <span class="text-sm text-gray-500 block">
                            {order.dropOffPhysicalLocation}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div
                      class="flex justify-between items-center mt-2 pt-2 border-t border-gray-200"
                    >
                      <div class="text-xs text-gray-500">
                        {dayJs().diff(order.createdAt, "minute") < 120
                          ? dayJs().diff(order.createdAt, "minute") +
                            " minutes ago"
                          : dayJs().diff(order.createdAt, "hours") < 24
                            ? dayJs().diff(order.createdAt, "hours") +
                              " hours ago"
                            : dayJs().diff(order.createdAt, "days") +
                              " days ago"}
                      </div>
                      <div class="text-secondary text-sm">View Details →</div>
                    </div>
                  </div>
                </a>
              {/if}
            {/each}
          {/if}
        {:else if displayedComponent === "incoming"}
          <p class="text-sm font-medium text-gray-500 mb-3">
            Packages Coming to You
          </p>

          {#if data.myOrders.filter((order) => order.receiverCustomerId === data.session?.customerData.id).length === 0}
            <div class="py-6 text-center">
              <p class="text-gray-500">No incoming packages yet</p>
            </div>
          {:else}
            {#each data.myOrders as order}
              {#if order.receiverCustomerId === data.session?.customerData.id}
                <a
                  href="/order-detail/{order.id}"
                  class="block transition-transform hover:scale-[1.01]"
                >
                  <div
                    class="bg-gray-50 px-4 py-4 shadow-sm border border-gray-100 my-3 rounded-lg hover:shadow-md transition-shadow"
                  >
                    <div class="flex justify-between items-start mb-2">
                      <p class="text-gray-800 font-bold">
                        Order #{order.id}
                      </p>
                      <div class="flex items-center">
                        <span
                          class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      {order.orderStatus === 'UNCLAIMED'
                            ? 'bg-yellow-100 text-yellow-800'
                            : order.orderStatus === 'CLAIMED'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-green-100 text-green-800'}"
                        >
                          {order.orderStatus.toLowerCase()}
                        </span>
                      </div>
                    </div>

                    <div class="space-y-1 mb-2">
                      <div class="flex items-start">
                        <span class="text-gray-500 w-16">From:</span>
                        <div class="flex-1">
                          <span class="font-medium text-gray-800"
                            >{order.Sender.User.userName}</span
                          >
                          <span class="text-sm text-gray-500 block">
                            {order.pickUpPhysicalLocation}
                          </span>
                        </div>
                      </div>

                      <div class="flex items-start">
                        <span class="text-gray-500 w-16">To:</span>
                        <div class="flex-1">
                          <span class="font-medium text-gray-800">
                            {order.receiverName
                              ? order.receiverName
                              : order.Receiver?.User.userName}
                          </span>
                          <span class="text-sm text-gray-500 block">
                            {order.dropOffPhysicalLocation}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div
                      class="flex justify-between items-center mt-2 pt-2 border-t border-gray-200"
                    >
                      <div class="text-xs text-gray-500">
                        {dayJs().diff(order.createdAt, "minute") < 120
                          ? dayJs().diff(order.createdAt, "minute") +
                            " minutes ago"
                          : dayJs().diff(order.createdAt, "hours") < 24
                            ? dayJs().diff(order.createdAt, "hours") +
                              " hours ago"
                            : dayJs().diff(order.createdAt, "days") +
                              " days ago"}
                      </div>
                      <div class="text-secondary text-sm">View Details →</div>
                    </div>
                  </div>
                </a>
              {/if}
            {/each}
          {/if}
        {:else}
          <p>Something went wrong</p>
        {/if}
      </div>
    </div>

    <!-- Search Results (if any) -->
    {#if searchDisplay && form?.orderFound}
      <div
        transition:slide={{ duration: 300 }}
        class="bg-white rounded-xl shadow-md overflow-hidden mb-6"
      >
        <div class="bg-secondary text-white p-4">
          <h2 class="text-lg font-semibold">Search Result</h2>
        </div>
        <div class="p-4">
          <a href="/order-detail/{form.orderFound.id}" class="block">
            <div
              class="bg-gray-50 px-4 py-4 shadow-sm border border-gray-100 rounded-lg hover:shadow-md transition-shadow"
            >
              <div class="flex justify-between items-start mb-2">
                <p class="text-gray-800 font-bold">
                  Order #{form.orderFound.id}
                </p>
                <div class="flex items-center">
                  <span
                    class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                {form.orderFound.orderStatus === 'UNCLAIMED'
                      ? 'bg-yellow-100 text-yellow-800'
                      : form.orderFound.orderStatus === 'CLAIMED'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-green-100 text-green-800'}"
                  >
                    {form.orderFound.orderStatus.toLowerCase()}
                  </span>
                </div>
              </div>

              <div class="space-y-1 mb-2">
                <div class="flex items-start">
                  <span class="text-gray-500 w-16">From:</span>
                  <div class="flex-1">
                    <span class="font-medium text-gray-800"
                      >{form.orderFound.Sender.User.userName}</span
                    >
                    <span class="text-sm text-gray-500 block">
                      {form.orderFound.pickUpPhysicalLocation}
                    </span>
                  </div>
                </div>

                <div class="flex items-start">
                  <span class="text-gray-500 w-16">To:</span>
                  <div class="flex-1">
                    <span class="font-medium text-gray-800">
                      {form.orderFound.receiverName
                        ? form.orderFound.receiverName
                        : form.orderFound.Receiver?.User.userName}
                    </span>
                    <span class="text-sm text-gray-500 block">
                      {form.orderFound.dropOffPhysicalLocation}
                    </span>
                  </div>
                </div>
              </div>

              <div class="mt-2 pt-2 border-t border-gray-200 text-center">
                <span class="text-secondary font-medium"
                  >Click to view details</span
                >
              </div>
            </div>
          </a>
        </div>
      </div>
    {/if}

    <!-- Quick Actions -->
    <div class="bg-white rounded-xl shadow-md overflow-hidden mb-6">
      <div class="p-4">
        <h2 class="text-lg font-semibold text-gray-800 mb-3">Quick Actions</h2>
        <div class="grid grid-cols-2 gap-3">
          <a href="/create-order" class="block">
            <div
              class="bg-secondary/10 hover:bg-secondary/20 transition-colors p-4 rounded-lg text-center"
            >
              <div
                class="bg-secondary/20 w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-2"
              >
                <Add class="w-6 h-6 text-secondary" />
              </div>
              <p class="font-medium text-gray-800">New Order</p>
              <p class="text-xs text-gray-500">Ship a package</p>
            </div>
          </a>
          <button
            on:click={() => (showPricingCalculator = !showPricingCalculator)}
            class="block w-full"
          >
            <div
              class="bg-primary/10 hover:bg-primary/20 transition-colors p-4 rounded-lg text-center"
            >
              <div
                class="bg-primary/20 w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-2"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-6 h-6 text-primary"
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
              <p class="font-medium text-gray-800">Price Calculator</p>
              <p class="text-xs text-gray-500">Estimate shipping costs</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
