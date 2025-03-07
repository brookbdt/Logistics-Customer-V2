<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import dayjs from "dayjs";

  export let show = false;
  export let discountPercentage = 5;
  export let discountExpiryMinutes = 10;
  export let totalOrders = 0;

  let timeRemaining = discountExpiryMinutes * 60; // in seconds
  let interval: ReturnType<typeof setInterval> | undefined;
  let completedToday = Math.floor(Math.random() * 50) + 120; // Random number between 120-170

  $: formattedTime = formatRemainingTime(timeRemaining);

  function formatRemainingTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? "0" : ""}${remainingSeconds}`;
  }

  onMount(() => {
    if (show) {
      interval = setInterval(() => {
        timeRemaining -= 1;
        if (timeRemaining <= 0) {
          clearInterval(interval as ReturnType<typeof setInterval>);
        }
      }, 1000);
    }
  });

  onDestroy(() => {
    if (interval) clearInterval(interval);
  });
</script>

{#if show}
  <div class="mt-6 mb-8 space-y-6">
    <!-- Discount Timer -->
    {#if timeRemaining > 0}
      <div
        class="bg-gradient-to-r from-yellow-50 to-orange-50 p-4 rounded-lg border border-yellow-200 shadow-sm"
      >
        <div class="flex items-center space-x-4">
          <div class="flex-shrink-0">
            <span class="text-2xl">⏱️</span>
          </div>
          <div class="flex-grow">
            <h3 class="font-bold text-orange-700">Limited Time Offer!</h3>
            <p class="text-sm text-orange-700">
              Complete your payment in the next <span
                class="font-bold text-red-600">{formattedTime}</span
              >
              and receive a
              <span class="font-bold text-red-600">{discountPercentage}%</span> discount!
            </p>
          </div>
        </div>
      </div>
    {/if}

    <!-- Trust Badges -->
    <div class="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
      <h3 class="text-center font-bold text-gray-700 mb-4">
        Why Customers Trust Us
      </h3>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        <div class="flex flex-col items-center">
          <span class="text-xl mb-1">🔒</span>
          <p class="text-xs font-medium">Secure Payment</p>
        </div>
        <div class="flex flex-col items-center">
          <span class="text-xl mb-1">⭐</span>
          <p class="text-xs font-medium">4.9/5 Rating</p>
        </div>
        <div class="flex flex-col items-center">
          <span class="text-xl mb-1">🚚</span>
          <p class="text-xs font-medium">Fast Delivery</p>
        </div>
        <div class="flex flex-col items-center">
          <span class="text-xl mb-1">👥</span>
          <p class="text-xs font-medium">1,000+ Customers</p>
        </div>
      </div>
    </div>

    <!-- Order Activity -->
    <div class="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
      <div class="flex items-center space-x-3">
        <div class="flex-shrink-0">
          <div class="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
        </div>
        <p class="text-sm text-gray-600">
          <span class="font-medium">{completedToday}</span> orders completed today
        </p>
        {#if totalOrders > 0}
          <p class="text-xs text-gray-500 ml-auto">Order #{totalOrders}</p>
        {/if}
      </div>
    </div>
  </div>
{/if}
