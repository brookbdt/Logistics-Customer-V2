<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { fly, fade, scale } from "svelte/transition";

  export let show = false;
  export let onComplete = () => {};
  export let duration = 5000;

  let timer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    if (show) {
      timer = setTimeout(() => {
        onComplete();
      }, duration);
    }
  });

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });
</script>

{#if show}
  <div
    class="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
    in:fade={{ duration: 300 }}
    out:fade={{ duration: 500 }}
  >
    <div class="relative">
      <!-- Background glow -->
      <div
        class="absolute inset-0 bg-green-400 opacity-20 blur-3xl rounded-full"
        style="transform: scale(1.5);"
      ></div>

      <!-- Main container -->
      <div
        class="text-center p-8 rounded-xl bg-white/90 shadow-lg backdrop-blur-sm"
        in:scale={{
          duration: 600,
          start: 0.5,
          opacity: 0,
          easing: (t) => {
            const bounce = Math.sin(t * 6 * Math.PI) * 0.1;
            return Math.min(1, t + bounce);
          },
        }}
      >
        <!-- Emoji animation -->
        <div class="relative h-20 mb-4">
          <div class="absolute left-1/2 -ml-16 animate-bounce-1">
            <span class="text-4xl">🎉</span>
          </div>
          <div class="absolute left-1/2 ml-4 animate-bounce-2 delay-200">
            <span class="text-4xl">🚚</span>
          </div>
        </div>

        <!-- Message -->
        <h2
          class="text-3xl md:text-4xl font-bold text-green-600 mb-3 animate-pulse-slow"
        >
          Order Accepted!
        </h2>
        <p class="text-lg text-green-800 max-w-lg">
          Your order is now ready for <span class="font-bold">payment</span>!
        </p>

        <!-- Discount pill -->
        <div
          class="bg-yellow-100 text-yellow-800 font-bold px-4 py-2 rounded-full mt-4 inline-block animate-pulse-fast"
          in:fly={{ y: 50, duration: 500, delay: 700 }}
        >
          Limited-time discount available!
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes pulse-slow {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.9;
      transform: scale(1.05);
    }
  }

  @keyframes pulse-fast {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.05);
    }
  }

  @keyframes bounce-1 {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-15px);
    }
  }

  @keyframes bounce-2 {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-10px);
    }
  }

  .animate-pulse-slow {
    animation: pulse-slow 3s ease-in-out infinite;
  }

  .animate-pulse-fast {
    animation: pulse-fast 2s ease-in-out infinite;
  }

  .animate-bounce-1 {
    animation: bounce-1 1.5s ease-in-out infinite;
  }

  .animate-bounce-2 {
    animation: bounce-2 2s ease-in-out infinite;
  }

  .delay-200 {
    animation-delay: 200ms;
  }
</style>
