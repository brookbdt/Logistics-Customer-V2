<script lang="ts">
  import { page } from "$app/stores";
  import ArrowRight from "$lib/assets/icons/arrow-right.svg.svelte";
  import Logo from "$lib/assets/shared/logo.svg.svelte";
  import DeliveryTruck from "$lib/assets/shared/delivery-truck.svg.svelte";
  import { signIn } from "@auth/sveltekit/client";
  import { toast } from "@zerodevx/svelte-toast";
  import { superForm } from "sveltekit-superforms/client";
  import { fly, fade } from "svelte/transition";
  import { onMount } from "svelte";

  export let data;
  export let form;

  const {
    form: sendEmailForm,
    enhance,
    allErrors,
    constraints,
  } = superForm(data.sendEmailForm);

  let mounted = false;

  onMount(() => {
    mounted = true;
  });

  $: for (const error of $allErrors) {
    toast.push(error.messages.join(" "));
  }
  $: form?.emailSent
    ? toast.push("Please check your email for sign up link", {
        duration: 10000,
      })
    : null;
</script>

<div
  class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col md:flex-row"
>
  <!-- Left side - Branding and value proposition -->
  <div
    class="w-full md:w-1/2 flex flex-col justify-center items-center p-8 md:p-16 text-center md:text-left"
  >
    {#if mounted}
      <div in:fly={{ y: -20, duration: 800, delay: 200 }} class="group mb-6">
        <Logo class="w-40 h-auto md:w-48 md:h-auto" />
      </div>
      <h1
        class="text-4xl md:text-5xl font-bold mb-4 text-gray-800"
        in:fly={{ y: -20, duration: 800, delay: 400 }}
      >
        Fast Delivery at Your Fingertips
      </h1>
      <p
        class="text-xl text-gray-600 mb-8 max-w-md"
        in:fly={{ y: -20, duration: 800, delay: 600 }}
      >
        Join thousands of satisfied customers who trust us with their logistics
        needs.
      </p>
      <div
        class="relative h-64 w-full max-w-md mb-8 hidden md:block"
        in:fade={{ duration: 1000, delay: 800 }}
      >
        <div class="absolute inset-0 flex items-center justify-center">
          <DeliveryTruck class="w-48 h-48 text-indigo-500" />
        </div>
        <div
          class="absolute -bottom-4 left-1/2 transform -translate-x-1/2 w-3/4 h-8 bg-black/10 rounded-full blur-md"
        ></div>
      </div>
    {/if}
  </div>

  <!-- Right side - Authentication form -->
  <div
    class="w-full md:w-1/2 bg-white shadow-2xl rounded-t-3xl md:rounded-l-3xl md:rounded-tr-none p-8 md:p-16 flex flex-col justify-center"
  >
    {#if !$page.data.session}
      {#if mounted}
        <div in:fly={{ x: 20, duration: 800, delay: 200 }}>
          <h2 class="text-3xl font-bold mb-2 text-gray-800">Welcome!</h2>
          <p class="text-gray-600 mb-8">
            Sign in to track your deliveries and place new orders.
          </p>
        </div>

        <form
          method="post"
          action="?/sendEmail"
          use:enhance
          class="mb-6"
          in:fly={{ x: 20, duration: 800, delay: 400 }}
        >
          <label class="block mb-6">
            <span class="text-gray-700 text-sm font-medium block mb-2"
              >Email Address</span
            >
            <div class="relative">
              <input
                class="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 transition-all duration-200"
                type="email"
                name="email"
                placeholder="your@email.com"
                bind:value={$sendEmailForm.email}
                {...$constraints.email}
              />
            </div>
          </label>

          <button
            class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-xl transition-all duration-200 flex justify-center items-center"
          >
            <span class="mr-2">Continue with Magic Link</span>
            <ArrowRight class="w-4 h-4" />
          </button>
        </form>

        <div
          class="flex items-center my-6"
          in:fly={{ x: 20, duration: 800, delay: 600 }}
        >
          <div class="flex-grow h-px bg-gray-300"></div>
          <span class="px-4 text-sm text-gray-500">or</span>
          <div class="flex-grow h-px bg-gray-300"></div>
        </div>

        <button
          class="w-full flex justify-center items-center py-3 px-4 border border-gray-300 rounded-xl shadow-sm bg-white hover:bg-gray-50 transition-all duration-200"
          on:click={() => signIn("google", { callbackUrl: "/" })}
          in:fly={{ x: 20, duration: 800, delay: 800 }}
        >
          <svg class="w-5 h-5 mr-2" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Sign in with Google
        </button>

        <p
          class="text-sm text-center text-gray-500 mt-8"
          in:fade={{ duration: 800, delay: 1000 }}
        >
          By signing in, you agree to our <a
            href="#"
            class="text-indigo-600 hover:underline">Terms of Service</a
          >
          and
          <a href="#" class="text-indigo-600 hover:underline">Privacy Policy</a>
        </p>
      {/if}
    {/if}
  </div>
</div>

<style>
  /* Add some subtle animations */
  input,
  button {
    transition: transform 0.2s ease;
  }

  input:focus,
  button:hover {
    transform: translateY(-2px);
  }

  @keyframes float {
    0% {
      transform: translateY(0px);
    }
    50% {
      transform: translateY(-10px);
    }
    100% {
      transform: translateY(0px);
    }
  }

  :global(.animate-float) {
    animation: float 6s ease-in-out infinite;
  }
</style>
