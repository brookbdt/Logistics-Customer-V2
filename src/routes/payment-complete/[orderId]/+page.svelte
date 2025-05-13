<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { browser } from "$app/environment";
  import { toast } from "@zerodevx/svelte-toast";
  import type { PageData } from "./$types";

  export let data: PageData;

  let countdown = 5; // Auto-redirect countdown

  onMount(() => {
    if (browser) {
      // Show toast based on payment status
      if (data.paymentSuccess) {
        if (data.isDraft) {
          toast.push(
            "Payment successful! Your order has been created and confirmed.",
            {
              theme: {
                "--toastBackground": "#10B981",
                "--toastBarBackground": "#059669",
              },
            }
          );
        } else {
          toast.push("Payment successful! Your order has been confirmed.", {
            theme: {
              "--toastBackground": "#10B981",
              "--toastBarBackground": "#059669",
            },
          });
        }
      } else {
        toast.push(
          "We were unable to verify your payment. Please contact support.",
          {
            theme: {
              "--toastBackground": "#EF4444",
              "--toastBarBackground": "#DC2626",
            },
          }
        );
      }

      // Start countdown for auto-redirect
      const timer = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
          clearInterval(timer);
          // Redirect to order details or appropriate page
          goto(`/order-detail/${data.orderId}`);
        }
      }, 1000);

      // Clean up timer
      return () => clearInterval(timer);
    }
  });
</script>

<div class="min-h-screen bg-gray-50 flex items-center justify-center px-4">
  <div class="max-w-md w-full bg-white rounded-xl shadow-xl overflow-hidden">
    <div class="p-8 text-center">
      {#if data.paymentSuccess}
        <div
          class="inline-flex h-20 w-20 rounded-full bg-green-100 items-center justify-center mb-6"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-10 w-10 text-green-500"
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
        <h2 class="text-2xl font-bold text-gray-800 mb-2">
          Payment Successful!
        </h2>

        {#if data.isDraft}
          <p class="text-gray-600 mb-6">
            Your order has been created and is now being processed. Thank you
            for your payment.
          </p>

          <div class="bg-blue-50 p-4 rounded-lg text-sm text-blue-700 mb-6">
            <p class="font-medium">What happens next:</p>
            <ol class="list-decimal list-inside mt-2 space-y-1">
              <li>Your order is now being reviewed by our team</li>
              <li>A warehouse will be assigned to process your delivery</li>
              <li>A courier will pick up your package for delivery</li>
            </ol>
          </div>
        {:else}
          <p class="text-gray-600 mb-6">
            Your payment has been processed successfully. Your order status has
            been updated.
          </p>
        {/if}
      {:else}
        <div
          class="inline-flex h-20 w-20 rounded-full bg-red-100 items-center justify-center mb-6"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-10 w-10 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h2 class="text-2xl font-bold text-gray-800 mb-2">
          Payment Verification Failed
        </h2>
        <p class="text-gray-600 mb-6">
          We were unable to verify your payment. Please check your transaction
          status or contact our support team.
        </p>
      {/if}

      <div class="flex flex-col space-y-4">
        <p class="text-gray-500 text-sm">
          Redirecting to order details in <span class="font-medium"
            >{countdown}</span
          > seconds...
        </p>
        <a
          href="/order-detail/{data.orderId}"
          class="w-full py-3 bg-primary hover:bg-primary-dark text-white rounded-lg font-medium transition-colors duration-200"
        >
          View Order Details
        </a>
        <a
          href="/all-orders"
          class="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors duration-200"
        >
          Go to My Orders
        </a>
      </div>
    </div>
  </div>
</div>
