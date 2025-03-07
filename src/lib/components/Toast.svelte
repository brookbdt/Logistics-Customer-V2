<script lang="ts">
  import { toast, type ToastMessage } from "$lib/utils/toast";
  import { fly, fade } from "svelte/transition";
  import { flip } from "svelte/animate";

  let toasts: ToastMessage[] = [];

  // Subscribe to the toast store
  const unsubscribe = toast.subscribe((value) => {
    toasts = value;
  });

  // Clean up subscription on component destroy
  import { onDestroy } from "svelte";
  onDestroy(unsubscribe);
</script>

{#if toasts.length > 0}
  <div class="toast-container">
    {#each toasts as t (t.id)}
      <div
        class="toast toast-{t.type}"
        animate:flip={{ duration: 300 }}
        in:fly={{ y: 50, duration: 300 }}
        out:fade={{ duration: 300 }}
        style={t.theme
          ? Object.entries(t.theme)
              .map(([key, value]) => `${key}: ${value}`)
              .join(";")
          : ""}
      >
        <div class="toast-content">
          <div class="toast-message">{t.message}</div>
          <button class="toast-close" on:click={() => toast.remove(t.id)}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div
          class="toast-progress-bar"
          style="animation-duration: {t.timeout}ms"
        ></div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-width: 24rem;
  }

  .toast {
    background-color: var(--toastBackground, #ffffff);
    color: var(--toastColor, #1a202c);
    border-radius: 0.375rem;
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.1),
      0 2px 4px -1px rgba(0, 0, 0, 0.06);
    overflow: hidden;
    position: relative;
  }

  .toast-success {
    --toastBackground: #48bb78;
    --toastColor: #ffffff;
    --toastBarBackground: #2f855a;
  }

  .toast-error {
    --toastBackground: #f56565;
    --toastColor: #ffffff;
    --toastBarBackground: #c53030;
  }

  .toast-warning {
    --toastBackground: #ed8936;
    --toastColor: #ffffff;
    --toastBarBackground: #c05621;
  }

  .toast-info {
    --toastBackground: #4299e1;
    --toastColor: #ffffff;
    --toastBarBackground: #2b6cb0;
  }

  .toast-content {
    padding: 0.75rem 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .toast-message {
    flex: 1;
    font-size: 0.875rem;
  }

  .toast-close {
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 0.25rem;
    margin-left: 0.5rem;
    opacity: 0.7;
    transition: opacity 0.2s;
  }

  .toast-close:hover {
    opacity: 1;
  }

  .toast-progress-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 4px;
    background-color: var(--toastBarBackground, rgba(0, 0, 0, 0.1));
    width: 100%;
    animation: progress-bar-shrink 1s linear forwards;
    transform-origin: left;
  }

  @keyframes progress-bar-shrink {
    0% {
      transform: scaleX(1);
    }
    100% {
      transform: scaleX(0);
    }
  }
</style>
