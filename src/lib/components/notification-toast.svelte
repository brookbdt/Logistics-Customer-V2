<!-- Custom notification toast component -->
<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let title: string;
  export let body: string;
  export let type: string = "";
  export let showAction: boolean = false;
  export let actionText: string = "View";

  const dispatch = createEventDispatcher();

  function handleAction() {
    dispatch("action");
  }

  function handleClick() {
    dispatch("click");
  }

  function handleDismiss() {
    dispatch("dismiss");
  }

  // Different icon and color based on notification type
  $: iconClass =
    type === "ORDER_ACCEPTED"
      ? "text-green-500"
      : type === "ORDER_DELIVERED"
        ? "text-blue-500"
        : "text-gray-500";

  $: icon =
    type === "ORDER_ACCEPTED"
      ? "check-circle"
      : type === "ORDER_DELIVERED"
        ? "package"
        : "bell";
</script>

<div
  class="bg-white shadow-lg rounded-lg p-4 mb-2 border-l-4 max-w-sm w-full mx-auto pointer-events-auto"
  class:border-green-500={type === "ORDER_ACCEPTED"}
  class:border-blue-500={type === "ORDER_DELIVERED"}
  class:border-gray-300={!type ||
    (type !== "ORDER_ACCEPTED" && type !== "ORDER_DELIVERED")}
  on:click={handleClick}
>
  <div class="flex items-start">
    <div class="flex-shrink-0">
      {#if icon === "check-circle"}
        <svg
          class={`h-6 w-6 ${iconClass}`}
          xmlns="http://www.w3.org/2000/svg"
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
      {:else if icon === "package"}
        <svg
          class={`h-6 w-6 ${iconClass}`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"
          />
        </svg>
      {:else}
        <svg
          class={`h-6 w-6 ${iconClass}`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
      {/if}
    </div>

    <div class="ml-3 w-0 flex-1 pt-0.5">
      <p class="text-sm font-medium text-gray-900">{title}</p>
      <p class="mt-1 text-sm text-gray-500">{body}</p>

      {#if showAction}
        <div class="mt-3">
          <button
            type="button"
            class="inline-flex items-center px-3 py-1.5 border border-transparent text-xs leading-4 font-medium rounded-md
            text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            on:click|stopPropagation={handleAction}
          >
            {actionText}
          </button>
        </div>
      {/if}
    </div>

    <div class="ml-4 flex-shrink-0 flex">
      <button
        class="bg-white rounded-md inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        on:click|stopPropagation={handleDismiss}
      >
        <span class="sr-only">Close</span>
        <svg
          class="h-5 w-5"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clip-rule="evenodd"
          />
        </svg>
      </button>
    </div>
  </div>
</div>
