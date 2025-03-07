<script lang="ts">
  import { toast } from "@zerodevx/svelte-toast";
  import { superForm } from "sveltekit-superforms/client";
  import { fade, fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import type { ActionData, PageData } from "./$types";
  import { createEventDispatcher } from "svelte";

  export let form: ActionData;
  export let data: PageData;
  export let componentsOrder: number; // Add this prop

  const dispatch = createEventDispatcher();
  let className = "";
  export { className as class };

  $: if (form?.checkoutUrl) {
    // @ts-ignores
    location.href = form.checkoutUrl.checkout_url;
  }

  const {
    form: addPaymentForm,
    enhance,
    constraints,
    errors,
  } = superForm(data.addPaymentForm);

  $: form?.errorMessage ? toast.push("Wrong Phone Number Format") : null;

  // Payment methods
  let selectedPaymentMethod = "card";

  // Security features to highlight
  const securityFeatures = [
    { icon: "🔒", text: "Secure Encryption" },
    { icon: "🛡️", text: "Fraud Protection" },
    { icon: "✅", text: "Verified Payment" },
  ];

  // Function to format price
  function formatPrice(price: number) {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  }
</script>

<div class={className} in:fade={{ duration: 300 }}>
  <div class="bg-white rounded-xl shadow-md overflow-hidden mb-4">
    <div class="bg-secondary text-white p-4">
      <h2 class="text-lg font-semibold">Payment Information</h2>
      <p class="text-sm opacity-90">Complete your order securely</p>
    </div>

    <div class="p-4">
      <!-- Payment Method Selection -->
      <div class="mb-6">
        <h3 class="text-sm font-medium text-gray-700 mb-3">
          Select Payment Method
        </h3>
        <div class="grid grid-cols-2 gap-3">
          <button
            class="border rounded-lg p-3 flex flex-col items-center justify-center {selectedPaymentMethod ===
            'card'
              ? 'border-secondary bg-secondary/5'
              : 'border-gray-200'}"
            on:click={() => (selectedPaymentMethod = "card")}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-6 w-6 mb-1 {selectedPaymentMethod === 'card'
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
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
            <span class="text-sm font-medium">Card Payment</span>
          </button>

          <button
            class="border rounded-lg p-3 flex flex-col items-center justify-center {selectedPaymentMethod ===
            'mobile'
              ? 'border-secondary bg-secondary/5'
              : 'border-gray-200'}"
            on:click={() => (selectedPaymentMethod = "mobile")}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-6 w-6 mb-1 {selectedPaymentMethod === 'mobile'
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
                d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
            <span class="text-sm font-medium">Mobile Money</span>
          </button>
        </div>
      </div>

      <!-- Payment Form -->
      <form use:enhance method="post" action="?/paymentUrl" class="space-y-4">
        <div in:fade={{ duration: 300 }}>
          <label class="block">
            <span class="text-sm font-medium text-gray-700 block mb-1"
              >Email</span
            >
            <input
              class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary/50 focus:border-secondary transition-all"
              type="email"
              name="email"
              placeholder="your@email.com"
              value={$addPaymentForm.email}
              {...$constraints.email}
            />
            {#if $errors.email}
              <p class="text-red-600 text-xs mt-1">{$errors.email}</p>
            {/if}
          </label>

          <div class="grid grid-cols-2 gap-3 mt-4">
            <label class="block">
              <span class="text-sm font-medium text-gray-700 block mb-1"
                >First Name</span
              >
              <input
                class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary/50 focus:border-secondary transition-all"
                type="text"
                name="firstName"
                placeholder="First Name"
                value={$addPaymentForm.firstName}
                {...$constraints.firstName}
              />
              {#if $errors.firstName}
                <p class="text-red-600 text-xs mt-1">{$errors.firstName}</p>
              {/if}
            </label>

            <label class="block">
              <span class="text-sm font-medium text-gray-700 block mb-1"
                >Last Name</span
              >
              <input
                class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary/50 focus:border-secondary transition-all"
                type="text"
                name="lastName"
                placeholder="Last Name"
                value={$addPaymentForm.lastName}
                {...$constraints.lastName}
              />
              {#if $errors.lastName}
                <p class="text-red-600 text-xs mt-1">{$errors.lastName}</p>
              {/if}
            </label>
          </div>

          <label class="block mt-4">
            <span class="text-sm font-medium text-gray-700 block mb-1"
              >Phone Number</span
            >
            <div class="relative">
              <div
                class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"
              >
                <span class="text-gray-500">+</span>
              </div>
              <input
                class="w-full p-3 pl-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary/50 focus:border-secondary transition-all"
                type="tel"
                name="phoneNumber"
                placeholder="251xxxxxxxxx"
                value={$addPaymentForm.phoneNumber}
                {...$constraints.phoneNumber}
              />
            </div>
            {#if $errors.phoneNumber}
              <p class="text-red-600 text-xs mt-1">{$errors.phoneNumber}</p>
            {/if}
          </label>

          <!-- Security Features -->
          <div class="mt-6 bg-gray-50 p-3 rounded-lg">
            <h4 class="text-sm font-medium text-gray-700 mb-2">
              Secure Payment
            </h4>
            <div class="flex justify-between">
              {#each securityFeatures as feature}
                <div class="flex flex-col items-center">
                  <span class="text-xl mb-1">{feature.icon}</span>
                  <span class="text-xs text-gray-600">{feature.text}</span>
                </div>
              {/each}
            </div>
          </div>

          <!-- Order Summary -->
          <div class="mt-6 border-t border-gray-200 pt-4">
            <h4 class="text-sm font-medium text-gray-700 mb-2">
              Order Summary
            </h4>
            <div class="flex justify-between mb-1">
              <span class="text-sm text-gray-600">Subtotal</span>
              <span class="text-sm">
                ${formatPrice(data.orderDetail?.totalCost || 0)}
              </span>
            </div>
            <div class="flex justify-between mb-1">
              <span class="text-sm text-gray-600">Processing Fee</span>
              <span class="text-sm">0.00</span>
            </div>
            <div
              class="flex justify-between font-medium pt-2 border-t border-gray-200 mt-2"
            >
              <span>Total</span>
              <span class="text-secondary">
                ${formatPrice(data.orderDetail?.totalCost || 0)}
              </span>
            </div>
          </div>

          <!-- Payment Button -->
          <button
            type="submit"
            class="w-full bg-secondary flex mt-6 justify-center items-center rounded-lg py-3 text-white font-medium hover:bg-secondary/90 transition-colors"
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
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
            Continue to Secure Payment
          </button>

          <!-- Terms and Privacy -->
          <p class="text-xs text-gray-500 text-center mt-4">
            By proceeding, you agree to our <a
              href="#"
              class="text-secondary hover:underline">Terms of Service</a
            >
            and
            <a href="#" class="text-secondary hover:underline">Privacy Policy</a
            >
          </p>
        </div>
      </form>
    </div>
  </div>

  <!-- Payment Methods Info -->
  <div class="bg-white rounded-xl shadow-md overflow-hidden mb-4">
    <div class="p-4">
      <h3 class="text-sm font-medium text-gray-700 mb-3">
        Accepted Payment Methods
      </h3>
      <div class="flex flex-wrap gap-3 justify-center">
        <div
          class="bg-gray-50 p-2 rounded-lg flex items-center justify-center w-16 h-10"
        >
          <span class="text-xs font-medium text-gray-800">Visa</span>
        </div>
        <div
          class="bg-gray-50 p-2 rounded-lg flex items-center justify-center w-16 h-10"
        >
          <span class="text-xs font-medium text-gray-800">MasterCard</span>
        </div>
        <div
          class="bg-gray-50 p-2 rounded-lg flex items-center justify-center w-16 h-10"
        >
          <span class="text-xs font-medium text-gray-800">Amex</span>
        </div>
        <div
          class="bg-gray-50 p-2 rounded-lg flex items-center justify-center w-16 h-10"
        >
          <span class="text-xs font-medium text-gray-800">Telebirr</span>
        </div>
        <div
          class="bg-gray-50 p-2 rounded-lg flex items-center justify-center w-16 h-10"
        >
          <span class="text-xs font-medium text-gray-800">CBE</span>
        </div>
      </div>
    </div>
  </div>

  <!-- FAQ Section -->
  <div class="bg-white rounded-xl shadow-md overflow-hidden mb-4">
    <div class="p-4">
      <h3 class="text-sm font-medium text-gray-700 mb-3">
        Frequently Asked Questions
      </h3>

      <div class="space-y-3">
        <div class="border-b border-gray-100 pb-3">
          <p class="text-sm font-medium text-gray-800 mb-1">
            Is my payment information secure?
          </p>
          <p class="text-xs text-gray-600">
            Yes, all payments are processed securely through Chapa, a trusted
            payment gateway with bank-level encryption.
          </p>
        </div>

        <div class="border-b border-gray-100 pb-3">
          <p class="text-sm font-medium text-gray-800 mb-1">
            When will I be charged?
          </p>
          <p class="text-xs text-gray-600">
            Your payment will be processed immediately after you complete the
            checkout process.
          </p>
        </div>

        <div>
          <p class="text-sm font-medium text-gray-800 mb-1">
            What if I need to cancel my order?
          </p>
          <p class="text-xs text-gray-600">
            You can cancel your order before it's dispatched for a full refund.
            Contact our customer support for assistance.
          </p>
        </div>
      </div>
    </div>
  </div>

  <!-- Back Button -->
  <button
    on:click={() => dispatch("back")}
    class="w-full border border-gray-300 text-gray-700 font-medium py-3 rounded-lg hover:bg-gray-50 transition-colors mb-4"
  >
    Back to Order Summary
  </button>
</div>
