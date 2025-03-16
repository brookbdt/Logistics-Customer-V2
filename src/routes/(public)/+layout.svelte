<script lang="ts">
  import "../../app.postcss";
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { page } from "$app/stores";

  // Navigation links
  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/services", label: "Services" },
    { href: "/about", label: "About Us" },
    { href: "/contact", label: "Contact" },
  ];

  // Mobile menu state
  let mobileMenuOpen = false;
  let scrolled = false;

  // Handle scroll for navbar styling
  onMount(() => {
    const handleScroll = () => {
      scrolled = window.scrollY > 20;
    };

    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  });
</script>

<div class="flex flex-col min-h-screen">
  <!-- Header/Navbar -->
  <header
    class="fixed w-full z-50 transition-all duration-300"
    class:bg-white={scrolled}
    class:shadow-md={scrolled}
    class:bg-transparent={!scrolled}
  >
    <div class="container mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center py-4">
        <!-- Logo -->
        <a href="/" class="flex items-center space-x-2">
          <span class="text-2xl font-bold text-primary">Behulum</span>
          <span class="text-xl font-light">Logistics</span>
        </a>

        <!-- Desktop Navigation -->
        <nav class="hidden md:flex space-x-8">
          {#each navLinks as link}
            <a
              href={link.href}
              class="text-gray-700 hover:text-primary transition-colors duration-300 font-medium"
              class:text-primary={$page.url.pathname === link.href}
            >
              {link.label}
            </a>
          {/each}
        </nav>

        <!-- CTA Buttons -->
        <div class="hidden md:flex items-center space-x-4">
          <a
            href="/auth"
            class="text-primary hover:text-primary-dark transition-colors duration-300"
          >
            Log In
          </a>
          <a
            href="/auth"
            class="bg-primary hover:bg-primary-dark text-white px-6 py-2 rounded-md transition-colors duration-300"
          >
            Get Started
          </a>
        </div>

        <!-- Mobile Menu Button -->
        <button
          class="md:hidden text-gray-700"
          on:click={() => (mobileMenuOpen = !mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {#if mobileMenuOpen}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-6 w-6"
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
          {:else}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          {/if}
        </button>
      </div>
    </div>

    <!-- Mobile Menu -->
    {#if mobileMenuOpen}
      <div
        class="md:hidden bg-white shadow-lg absolute w-full"
        transition:fade={{ duration: 200 }}
      >
        <div class="px-4 py-4 space-y-4">
          {#each navLinks as link}
            <a
              href={link.href}
              class="block text-gray-700 hover:text-primary transition-colors duration-300 font-medium"
              class:text-primary={$page.url.pathname === link.href}
              on:click={() => (mobileMenuOpen = false)}
            >
              {link.label}
            </a>
          {/each}
          <div class="pt-4 border-t border-gray-200 flex flex-col space-y-4">
            <a
              href="/auth"
              class="text-primary hover:text-primary-dark transition-colors duration-300"
              on:click={() => (mobileMenuOpen = false)}
            >
              Log In
            </a>
            <a
              href="/auth"
              class="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-md transition-colors duration-300 text-center"
              on:click={() => (mobileMenuOpen = false)}
            >
              Get Started
            </a>
          </div>
        </div>
      </div>
    {/if}
  </header>

  <!-- Main Content -->
  <main class="flex-grow">
    <slot />
  </main>

  <!-- Footer -->
  <footer class="bg-gray-900 text-white">
    <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
        <!-- Company Info -->
        <div class="col-span-1 md:col-span-1">
          <div class="flex items-center space-x-2 mb-4">
            <span class="text-xl font-bold text-primary">Behulum</span>
            <span class="text-lg font-light">Logistics</span>
          </div>
          <p class="text-gray-400 mb-4">
            Transforming logistics in Ethiopia with innovative solutions and
            reliable service.
          </p>
          <div class="flex space-x-4">
            <a
              href="#"
              class="text-gray-400 hover:text-white transition-colors duration-300"
            >
              <svg
                class="h-6 w-6"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fill-rule="evenodd"
                  d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"
                  clip-rule="evenodd"
                />
              </svg>
            </a>
            <a
              href="#"
              class="text-gray-400 hover:text-white transition-colors duration-300"
            >
              <svg
                class="h-6 w-6"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84"
                />
              </svg>
            </a>
            <a
              href="#"
              class="text-gray-400 hover:text-white transition-colors duration-300"
            >
              <svg
                class="h-6 w-6"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fill-rule="evenodd"
                  d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z"
                  clip-rule="evenodd"
                />
              </svg>
            </a>
          </div>
        </div>

        <!-- Quick Links -->
        <div>
          <h3 class="text-lg font-semibold mb-4">Quick Links</h3>
          <ul class="space-y-2">
            <li>
              <a
                href="/"
                class="text-gray-400 hover:text-white transition-colors duration-300"
                >Home</a
              >
            </li>
            <li>
              <a
                href="/services"
                class="text-gray-400 hover:text-white transition-colors duration-300"
                >Services</a
              >
            </li>
            <li>
              <a
                href="/about"
                class="text-gray-400 hover:text-white transition-colors duration-300"
                >About Us</a
              >
            </li>
            <li>
              <a
                href="/contact"
                class="text-gray-400 hover:text-white transition-colors duration-300"
                >Contact</a
              >
            </li>
          </ul>
        </div>

        <!-- Services -->
        <div>
          <h3 class="text-lg font-semibold mb-4">Our Services</h3>
          <ul class="space-y-2">
            <li>
              <a
                href="/services#express"
                class="text-gray-400 hover:text-white transition-colors duration-300"
                >Express Delivery</a
              >
            </li>
            <li>
              <a
                href="/services#warehouse"
                class="text-gray-400 hover:text-white transition-colors duration-300"
                >Warehousing</a
              >
            </li>
            <li>
              <a
                href="/services#freight"
                class="text-gray-400 hover:text-white transition-colors duration-300"
                >Freight Forwarding</a
              >
            </li>
            <li>
              <a
                href="/services#tracking"
                class="text-gray-400 hover:text-white transition-colors duration-300"
                >Real-time Tracking</a
              >
            </li>
          </ul>
        </div>

        <!-- Contact -->
        <div>
          <h3 class="text-lg font-semibold mb-4">Contact Us</h3>
          <ul class="space-y-2">
            <li class="flex items-start space-x-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5 text-gray-400 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span class="text-gray-400">Addis Ababa, Ethiopia</span>
            </li>
            <li class="flex items-start space-x-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5 text-gray-400 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              <span class="text-gray-400">logistics@behulum.com</span>
            </li>
            <li class="flex items-start space-x-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5 text-gray-400 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                />
              </svg>
              <span class="text-gray-400">+251 91 234 5678</span>
            </li>
          </ul>
        </div>
      </div>

      <div class="border-t border-gray-800 mt-12 pt-8">
        <div class="flex flex-col md:flex-row justify-between items-center">
          <p class="text-gray-400 text-sm">
            &copy; {new Date().getFullYear()} Behulum Logistics. All rights reserved.
          </p>
          <div class="flex space-x-6 mt-4 md:mt-0">
            <a
              href="/terms-of-service"
              class="text-gray-400 hover:text-white text-sm transition-colors duration-300"
              >Terms of Service</a
            >
            <a
              href="/privacy-policy"
              class="text-gray-400 hover:text-white text-sm transition-colors duration-300"
              >Privacy Policy</a
            >
          </div>
        </div>
      </div>
    </div>
  </footer>
</div>

<style>
  :global(html) {
    scroll-behavior: smooth;
  }
</style>
