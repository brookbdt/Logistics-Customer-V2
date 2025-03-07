<script lang="ts">
  import type { PackageType } from "@prisma/client";
  import type { ActionData } from "./$types";
  import { toast } from "@zerodevx/svelte-toast";
  import { goto } from "$app/navigation";
  import { fade } from "svelte/transition";

  export let form: ActionData | undefined = undefined;

  let className = "";
  export { className as class };
  export let packageType: PackageType | null;
  export let disableInput = false;

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
    CONTAINER: {
      title: "Container",
      description: "Full shipping container for large volumes",
      icon: "🚢",
      examples: "Commercial goods, large machinery, bulk items",
    },
  };

  // Handle package selection
  function selectPackage(type: PackageType) {
    packageType = type;
  }

  $: form?.newOrder ? (toast.push("Order Created"), goto("/")) : null;
</script>

<div class="{className} space-y-6" in:fade={{ duration: 300 }}>
  <div class="mb-6">
    <h2 class="text-xl font-bold text-gray-800 mb-2">Package Details</h2>
    <p class="text-gray-600 text-sm">
      Select the type of package you're sending
    </p>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
    {#each Object.entries(packageDescriptions) as [type, details]}
      <button
        type="button"
        disabled={disableInput}
        class="text-left p-5 border rounded-xl transition-all {packageType ===
        type
          ? 'border-secondary bg-secondary/5 shadow-md'
          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}"
        on:click={() => selectPackage(type)}
      >
        <div class="flex flex-col h-full">
          <div class="text-3xl mb-3">{details.icon}</div>
          <h3 class="font-semibold text-gray-800 mb-1">{details.title}</h3>
          <p class="text-sm text-gray-600 mb-3">{details.description}</p>
          <div class="mt-auto">
            <p class="text-xs text-gray-500">Examples: {details.examples}</p>
          </div>

          {#if packageType === type}
            <div class="absolute top-3 right-3">
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
        </div>
      </button>
    {/each}
  </div>

  <div class="mt-8">
    <h3 class="text-sm font-medium text-gray-700 mb-3">
      Additional Information
    </h3>

    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-800">
      <div class="flex items-start">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-5 w-5 mr-2 mt-0.5 text-blue-600"
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
          <p class="text-sm mb-2">Package details help us determine:</p>
          <ul class="text-xs list-disc list-inside space-y-1">
            <li>The appropriate vehicle for transportation</li>
            <li>Handling requirements and equipment needed</li>
            <li>Accurate pricing based on size and weight</li>
          </ul>
        </div>
      </div>
    </div>
  </div>

  {#if !packageType}
    <div
      class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800 mt-4"
    >
      <div class="flex items-center">
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
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <p class="text-sm">Please select a package type to continue</p>
      </div>
    </div>
  {/if}
</div>
