<script lang="ts">
  import { toast } from "@zerodevx/svelte-toast";
  import { superForm } from "sveltekit-superforms/client";
  import { fade, fly, slide } from "svelte/transition";
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
    // Open Chapa in a new tab
    window.open(form.checkoutUrl.checkout_url, "_blank");
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

  let paymentMethod = "bank_transfer"; // Default to bank transfer
  let transactionRef = ""; // For bank transfer reference number
  let isSubmitting = false;
  let uploadedFile: File | null = null;
  let previewUrl: string | null = null;

  // Bank account details for different banks
  const bankAccounts = [
    {
      name: "Commercial Bank of Ethiopia (CBE)",
      accountNumber: "1000123456789",
      accountName: "Logistics Customer App",
      branch: "Bole Branch",
    },
    {
      name: "Dashen Bank",
      accountNumber: "0123456789",
      accountName: "Logistics Customer App",
      branch: "Main Branch",
    },
    {
      name: "Awash Bank",
      accountNumber: "9876543210",
      accountName: "Logistics Customer App",
      branch: "Addis Ababa Branch",
    },
    {
      name: "Telebirr",
      accountNumber: "0911987654",
      accountName: "Logistics Customer App",
    },
  ];

  // Handle file selection for payment receipt
  function handleFileChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) {
      previewUrl = null;
      uploadedFile = null;
      return;
    }

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (!validTypes.includes(file.type)) {
      toast.push("Please upload JPG or PNG files only", {
        theme: {
          "--toastBackground": "#F87171",
          "--toastColor": "white",
        },
      });
      target.value = "";
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.push("File size should be less than 5MB", {
        theme: {
          "--toastBackground": "#F87171",
          "--toastColor": "white",
        },
      });
      target.value = "";
      return;
    }

    uploadedFile = file;

    // Create preview URL
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      previewUrl = reader.result as string;
    };
  }

  // Handle bank transfer submission
  async function handleBankTransferSubmit() {
    // No transaction ref is needed - just proceed
    isSubmitting = true;

    // Simulating form submission - in reality, this would be sent to the server
    setTimeout(() => {
      isSubmitting = false;
      toast.push(
        "Bank transfer selection confirmed. Please make the payment and keep your receipt for the driver.",
        {
          theme: {
            "--toastBackground": "#10B981",
            "--toastColor": "white",
          },
        }
      );

      // Return to order review
      dispatch("back");
    }, 1500);
  }

  // Handle cash payment selection
  function selectCashPayment() {
    toast.push(
      "Cash payment selected. Please have the exact amount ready for your driver.",
      {
        theme: {
          "--toastBackground": "#10B981",
          "--toastColor": "white",
        },
      }
    );

    // Return to order review
    dispatch("back");
  }

  // Helper function to safely format price
  function safeFormatPrice(price: number | null | undefined): string {
    if (price === null || price === undefined) return "0.00";
    return price.toFixed(2);
  }
</script>

<div class={className} in:fade={{ duration: 300 }}>
  <div class="bg-white rounded-xl shadow-md overflow-hidden mb-4">
    <div class="bg-secondary text-white p-4">
      <h2 class="text-lg font-semibold">Payment Information</h2>
      <p class="text-sm opacity-90">
        {#if data.orderDetail && "paymentOption" in data.orderDetail && data.orderDetail.paymentOption === "pay_now"}
          Complete your order payment securely
        {:else if data.orderDetail?.orderStatus === "ACCEPTED"}
          Your order has been accepted! Complete payment securely
        {:else}
          Complete your order securely
        {/if}
      </p>
    </div>

    <div class="p-4">
      <!-- Payment Method Selection -->
      <div class="mb-6">
        <h3 class="text-sm font-medium text-gray-700 mb-3">
          Select Payment Method
        </h3>
        <div class="space-y-3">
          <div
            class="flex items-center p-4 border rounded-lg cursor-pointer {paymentMethod ===
            'bank_transfer'
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200'}"
            on:click={() => (paymentMethod = "bank_transfer")}
          >
            <div class="flex-shrink-0 mr-4">
              <div
                class="h-5 w-5 rounded-full border-2 {paymentMethod ===
                'bank_transfer'
                  ? 'border-blue-500'
                  : 'border-gray-400'} flex items-center justify-center"
              >
                {#if paymentMethod === "bank_transfer"}
                  <div class="h-3 w-3 rounded-full bg-blue-500"></div>
                {/if}
              </div>
            </div>
            <div class="flex-grow">
              <h4 class="font-medium text-gray-800">Bank Transfer</h4>
              <p class="text-sm text-gray-600">
                Transfer to our bank account and provide reference
              </p>
            </div>
            <div class="flex-shrink-0">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-6 w-6 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"
                />
              </svg>
            </div>
          </div>

          <div
            class="flex items-center p-4 border rounded-lg cursor-pointer {paymentMethod ===
            'cash'
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200'}"
            on:click={() => (paymentMethod = "cash")}
          >
            <div class="flex-shrink-0 mr-4">
              <div
                class="h-5 w-5 rounded-full border-2 {paymentMethod === 'cash'
                  ? 'border-blue-500'
                  : 'border-gray-400'} flex items-center justify-center"
              >
                {#if paymentMethod === "cash"}
                  <div class="h-3 w-3 rounded-full bg-blue-500"></div>
                {/if}
              </div>
            </div>
            <div class="flex-grow">
              <h4 class="font-medium text-gray-800">Cash Payment</h4>
              <p class="text-sm text-gray-600">
                Pay with cash upon {data.orderDetail?.paymentOption ===
                "pay_on_pickup"
                  ? "pickup"
                  : "delivery"}
              </p>
            </div>
            <div class="flex-shrink-0">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-6 w-6 text-gray-400"
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
          </div>

          <!-- Online payment with Chapa -->
          <div
            class="flex items-center p-4 border rounded-lg cursor-pointer {paymentMethod ===
            'online'
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200'}"
            on:click={() => (paymentMethod = "online")}
          >
            <div class="flex-shrink-0 mr-4">
              <div
                class="h-5 w-5 rounded-full border-2 {paymentMethod === 'online'
                  ? 'border-blue-500'
                  : 'border-gray-400'} flex items-center justify-center"
              >
                {#if paymentMethod === "online"}
                  <div class="h-3 w-3 rounded-full bg-blue-500"></div>
                {/if}
              </div>
            </div>
            <div class="flex-grow">
              <h4 class="font-medium text-gray-800">Online Payment</h4>
              <p class="text-sm text-gray-600">
                Pay securely with card or mobile money
              </p>
            </div>
            <div class="flex-shrink-0">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-6 w-6 text-gray-400"
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
        </div>
      </div>

      <!-- Bank Transfer Details -->
      {#if paymentMethod === "bank_transfer"}
        <div transition:slide={{ duration: 300 }} class="mb-6">
          <div class="p-4 border border-blue-200 rounded-lg bg-blue-50">
            <h4 class="font-medium text-blue-800 mb-3">
              Bank Account Information
            </h4>

            <div class="space-y-4">
              {#each bankAccounts as account}
                <div class="p-3 bg-white rounded-lg border border-blue-100">
                  <h5 class="font-medium text-gray-800">{account.name}</h5>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    <div>
                      <span class="text-xs text-gray-500">Account Number</span>
                      <p class="text-sm font-medium">{account.accountNumber}</p>
                    </div>
                    <div>
                      <span class="text-xs text-gray-500">Account Name</span>
                      <p class="text-sm font-medium">{account.accountName}</p>
                    </div>
                    {#if account.branch}
                      <div>
                        <span class="text-xs text-gray-500">Branch</span>
                        <p class="text-sm font-medium">{account.branch}</p>
                      </div>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>

            <div class="mt-5">
              <p class="text-sm text-blue-700 mb-4">
                Please transfer ETB {safeFormatPrice(
                  data.orderDetail?.totalCost
                )} to any of the accounts above.
              </p>

              <div class="mb-4">
                <label
                  for="transactionRef"
                  class="block text-sm font-medium text-gray-700 mb-1"
                >
                  Transaction Reference Number (Optional)
                </label>
                <input
                  id="transactionRef"
                  bind:value={transactionRef}
                  class="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter bank transfer reference number"
                />
              </div>
            </div>

            <!-- Payment verification note -->
            <div class="mt-4 p-3 bg-white rounded-lg border border-blue-100">
              <div class="flex items-start">
                <div class="flex-shrink-0 mt-0.5">
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
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div class="ml-3">
                  <h5 class="text-sm font-medium text-gray-800">
                    What happens next?
                  </h5>
                  <p class="text-xs text-gray-600 mt-1">
                    After making the bank transfer, take a screenshot of your
                    payment confirmation. Our driver will verify your payment
                    when they arrive at {data.orderDetail?.paymentOption ===
                    "pay_on_pickup"
                      ? "pickup"
                      : "delivery"}. No need to upload anything now.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Cash Payment Details -->
      {#if paymentMethod === "cash"}
        <div transition:slide={{ duration: 300 }} class="mb-6">
          <div class="p-4 border border-green-200 rounded-lg bg-green-50">
            <h4 class="font-medium text-green-800 mb-3">
              Cash Payment Details
            </h4>
            <p class="text-sm text-green-700">
              You've selected to pay in cash upon {data.orderDetail
                ?.paymentOption === "pay_on_pickup"
                ? "pickup"
                : "delivery"}.
            </p>
            <div class="mt-4 p-3 bg-white rounded-lg border border-green-100">
              <div class="flex items-center">
                <div class="flex-shrink-0 mr-3">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-6 w-6 text-green-500"
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
                  <h5 class="font-medium text-gray-800">Important Note</h5>
                  <p class="text-sm text-gray-600 mt-1">
                    Please have the exact amount of ETB {safeFormatPrice(
                      data.orderDetail?.totalCost
                    )} ready when the driver arrives.
                  </p>
                </div>
              </div>
            </div>

            <!-- Cash payment note -->
            <div class="mt-4 p-3 bg-white rounded-lg border border-green-100">
              <div class="flex items-start">
                <div class="flex-shrink-0 mt-0.5">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5 text-green-500"
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
                <div class="ml-3">
                  <h5 class="text-sm font-medium text-gray-800">
                    What happens next?
                  </h5>
                  <p class="text-xs text-gray-600 mt-1">
                    After confirming cash payment, the driver will collect
                    payment from you upon {data.orderDetail?.paymentOption ===
                    "pay_on_pickup"
                      ? "pickup"
                      : "delivery"}. Please prepare the exact amount to ensure a
                    smooth transaction.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Online Payment Details -->
      {#if paymentMethod === "online"}
        <div transition:slide={{ duration: 300 }} class="mb-6">
          <div class="p-4 border border-blue-200 rounded-lg bg-blue-50">
            <h4 class="font-medium text-blue-800 mb-3">
              Secure Online Payment
            </h4>
            <p class="text-sm text-blue-700 mb-4">
              You'll be redirected to our secure payment gateway to complete
              your payment for ETB {safeFormatPrice(
                data.orderDetail?.totalCost
              )}.
            </p>

            <div class="mt-4 flex flex-wrap justify-center gap-2 mb-6">
              <div
                class="bg-white p-2 rounded-lg border border-gray-200 flex items-center"
              >
                <span class="text-xs font-medium text-gray-700 mx-2">Visa</span>
              </div>
              <div
                class="bg-white p-2 rounded-lg border border-gray-200 flex items-center"
              >
                <span class="text-xs font-medium text-gray-700 mx-2"
                  >MasterCard</span
                >
              </div>
              <div
                class="bg-white p-2 rounded-lg border border-gray-200 flex items-center"
              >
                <span class="text-xs font-medium text-gray-700 mx-2"
                  >Telebirr</span
                >
              </div>
              <div
                class="bg-white p-2 rounded-lg border border-gray-200 flex items-center"
              >
                <span class="text-xs font-medium text-gray-700 mx-2">CBE</span>
              </div>
            </div>

            <form
              method="POST"
              action="?/paymentUrl"
              use:enhance
              target="_blank"
            >
              <input type="hidden" name="email" value={$addPaymentForm.email} />
              <input
                type="hidden"
                name="firstName"
                value={$addPaymentForm.firstName}
              />
              <input
                type="hidden"
                name="lastName"
                value={$addPaymentForm.lastName}
              />
              <input
                type="hidden"
                name="phoneNumber"
                value={$addPaymentForm.phoneNumber}
              />

              <button
                type="submit"
                class="w-full bg-blue-600 text-white font-medium py-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
              >
                {#if isSubmitting}
                  <div
                    class="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"
                  ></div>
                  Processing...
                {:else}
                  Proceed to Payment
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
                      d="M14 5l7 7m0 0l-7 7m7-7H3"
                    />
                  </svg>
                {/if}
              </button>
            </form>

            <!-- Payment security note -->
            <div class="mt-4 p-3 bg-white rounded-lg border border-blue-100">
              <div class="flex items-start">
                <div class="flex-shrink-0 mt-0.5">
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
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div class="ml-3">
                  <h5 class="text-sm font-medium text-gray-800">
                    Secure Payment
                  </h5>
                  <p class="text-xs text-gray-600 mt-1">
                    Your payment information is processed securely. We do not
                    store credit card details.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Action Buttons -->
      <div class="mt-8 flex justify-between">
        <button
          on:click={() => dispatch("back")}
          class="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors flex items-center"
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
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Back to Review
        </button>

        {#if paymentMethod === "bank_transfer"}
          <button
            on:click={handleBankTransferSubmit}
            disabled={isSubmitting}
            class="bg-blue-600 text-white font-medium py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {#if isSubmitting}
              <div
                class="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"
              ></div>
              Processing...
            {:else}
              Submit Bank Transfer
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
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            {/if}
          </button>
        {:else if paymentMethod === "cash"}
          <button
            on:click={selectCashPayment}
            class="bg-green-600 text-white font-medium py-3 px-6 rounded-lg hover:bg-green-700 transition-colors flex items-center"
          >
            Confirm Cash Payment
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
                d="M14 5l7 7m0 0l-7 7m7-7H3"
              />
            </svg>
          </button>
        {/if}
      </div>
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
