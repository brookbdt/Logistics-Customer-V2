<script lang="ts">
  import { onMount } from "svelte";
  import { fade, fly } from "svelte/transition";

  // Testimonials data
  const testimonials = [
    {
      name: "Abebe Kebede",
      position: "CEO, Addis Retail",
      image: "https://randomuser.me/api/portraits/men/32.jpg",
      quote:
        "Behulum Logistics has transformed our delivery operations. Their reliable service and real-time tracking have increased our customer satisfaction by 40%.",
    },
    {
      name: "Sara Hailu",
      position: "Operations Manager, Ethio Distributors",
      image: "https://randomuser.me/api/portraits/women/44.jpg",
      quote:
        "We've reduced our logistics costs by 30% since partnering with Behulum. Their warehouse management solutions are unmatched in Ethiopia.",
    },
    {
      name: "Dawit Mekonnen",
      position: "Supply Chain Director, Addis Pharmaceuticals",
      image: "https://randomuser.me/api/portraits/men/62.jpg",
      quote:
        "The level of professionalism and attention to detail sets Behulum apart. Our sensitive medical shipments always arrive on time and in perfect condition.",
    },
  ];

  // Services data
  const services = [
    {
      title: "Express Delivery",
      description:
        "Same-day and next-day delivery services across Addis Ababa and major Ethiopian cities.",
      icon: "M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1zm-1-7a1 1 0 11-2 0 1 1 0 012 0zM7 8a1 1 0 11-2 0 1 1 0 012 0zm2 6a1 1 0 100-2 1 1 0 000 2z M11 15a1 1 0 11-2 0 1 1 0 012 0zm8-4a4 4 0 11-8 0 4 4 0 018 0z",
      id: "express",
    },
    {
      title: "Warehousing",
      description:
        "State-of-the-art storage facilities with inventory management systems and security.",
      icon: "M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z",
      id: "warehouse",
    },
    {
      title: "Freight Forwarding",
      description:
        "Comprehensive import/export services with customs clearance and documentation support.",
      icon: "M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1zM4 7h8M4 10h8M4 13h8m9-6a2 2 0 11-4 0 2 2 0 014 0z M18 17a2 2 0 100-4 2 2 0 000 4z M14 14h4",
      id: "freight",
    },
    {
      title: "Real-time Tracking",
      description:
        "Advanced GPS tracking and monitoring for complete visibility of your shipments.",
      icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7",
      id: "tracking",
    },
  ];

  // Stats data
  const stats = [
    { value: "98%", label: "On-time Delivery" },
    { value: "25,000+", label: "Monthly Deliveries" },
    { value: "4.9/5", label: "Customer Rating" },
    { value: "15+", label: "Cities Covered" },
  ];

  // Animation variables
  let visible = false;

  onMount(() => {
    visible = true;
  });

  // Animate numbers on scroll
  let statsSection: HTMLElement;
  let statsAnimated = false;

  function handleScroll() {
    if (statsSection && !statsAnimated) {
      const rect = statsSection.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        statsAnimated = true;
      }
    }
  }

  onMount(() => {
    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  });
</script>

<svelte:head>
  <title>Behulum Logistics | Premium Logistics Solutions in Ethiopia</title>
  <meta
    name="description"
    content="Behulum Logistics provides premium logistics, warehousing, and delivery services across Ethiopia. Real-time tracking, express delivery, and more."
  />
</svelte:head>

<!-- Hero Section -->
<section
  class="relative pt-32 pb-20 md:pt-40 md:pb-28 bg-gradient-to-br from-primary/10 to-primary/5"
>
  <div class="container mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex flex-col md:flex-row items-center">
      <!-- Hero Content -->
      <div class="md:w-1/2 md:pr-12 mb-12 md:mb-0">
        {#if visible}
          <div in:fly={{ y: 50, duration: 800, delay: 200 }}>
            <h1
              class="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-gray-900 mb-6"
            >
              <span class="text-primary">Premium Logistics</span> Solutions for Ethiopia
            </h1>
          </div>

          <div in:fly={{ y: 50, duration: 800, delay: 400 }}>
            <p class="text-lg md:text-xl text-gray-700 mb-8">
              Experience unmatched reliability, speed, and security for all your
              logistics needs. From express delivery to comprehensive
              warehousing solutions.
            </p>
          </div>

          <div
            in:fly={{ y: 50, duration: 800, delay: 600 }}
            class="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4"
          >
            <a
              href="/auth"
              class="btn bg-primary hover:bg-primary-dark text-white px-8 py-3 rounded-md text-lg font-medium transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
            >
              Get Started Now
            </a>
            <a
              href="#services"
              class="btn border-2 border-primary text-primary hover:bg-primary hover:text-white px-8 py-3 rounded-md text-lg font-medium transition-all duration-300"
            >
              Explore Services
            </a>
          </div>
        {/if}
      </div>

      <!-- Hero Image -->
      <div class="md:w-1/2">
        {#if visible}
          <div in:fade={{ duration: 1000, delay: 300 }} class="relative">
            <img
              src="https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80"
              alt="Logistics operations in Ethiopia"
              class="rounded-lg shadow-2xl w-full"
            />
            <div
              class="absolute -bottom-6 -left-6 bg-white p-4 rounded-lg shadow-lg"
            >
              <div class="flex items-center space-x-2">
                <div class="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                <span class="font-medium text-gray-800">Live Tracking</span>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Trusted By -->
    {#if visible}
      <div in:fade={{ duration: 1000, delay: 800 }} class="mt-20">
        <p class="text-center text-gray-500 mb-6">
          Trusted by Ethiopia's Leading Businesses
        </p>
        <div class="flex flex-wrap justify-center items-center gap-8 md:gap-16">
          <img
            src="https://via.placeholder.com/120x40?text=EthioCargo"
            alt="EthioCargo"
            class="h-8 opacity-70 hover:opacity-100 transition-opacity duration-300"
          />
          <img
            src="https://via.placeholder.com/120x40?text=AddisRetail"
            alt="AddisRetail"
            class="h-8 opacity-70 hover:opacity-100 transition-opacity duration-300"
          />
          <img
            src="https://via.placeholder.com/120x40?text=HabeshaFoods"
            alt="HabeshaFoods"
            class="h-8 opacity-70 hover:opacity-100 transition-opacity duration-300"
          />
          <img
            src="https://via.placeholder.com/120x40?text=EthioTelecom"
            alt="EthioTelecom"
            class="h-8 opacity-70 hover:opacity-100 transition-opacity duration-300"
          />
        </div>
      </div>
    {/if}
  </div>

  <!-- Decorative Elements -->
  <div
    class="absolute top-0 right-0 w-1/3 h-1/3 bg-primary/5 -z-10 rounded-bl-full"
  />
  <div
    class="absolute bottom-0 left-0 w-1/4 h-1/4 bg-primary/5 -z-10 rounded-tr-full"
  />
</section>

<!-- Services Section -->
<section id="services" class="py-20 bg-white">
  <div class="container mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center mb-16">
      <h2 class="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
        Our Premium Services
      </h2>
      <p class="text-lg text-gray-700 max-w-3xl mx-auto">
        Comprehensive logistics solutions designed to meet the unique needs of
        businesses across Ethiopia.
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
      {#each services as service}
        <div
          id={service.id}
          class="bg-white rounded-lg p-8 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-2 border border-gray-100"
        >
          <div
            class="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mb-6"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-8 w-8 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                d={service.icon}
              />
            </svg>
          </div>
          <h3 class="text-xl font-semibold text-gray-900 mb-3">
            {service.title}
          </h3>
          <p class="text-gray-700">{service.description}</p>
          <a
            href={`/services#${service.id}`}
            class="inline-block mt-4 text-primary font-medium hover:text-primary-dark transition-colors duration-300"
          >
            Learn more →
          </a>
        </div>
      {/each}
    </div>
  </div>
</section>

<!-- Stats Section -->
<section bind:this={statsSection} class="py-16 bg-primary text-white">
  <div class="container mx-auto px-4 sm:px-6 lg:px-8">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
      {#each stats as stat, i}
        <div class="p-6">
          <div class="text-4xl md:text-5xl font-bold mb-2">
            {#if statsAnimated}
              <span in:fly={{ y: 30, duration: 1000, delay: i * 200 }}
                >{stat.value}</span
              >
            {:else}
              <span>{stat.value}</span>
            {/if}
          </div>
          <p class="text-primary-50">{stat.label}</p>
        </div>
      {/each}
    </div>
  </div>
</section>

<!-- Why Choose Us Section -->
<section class="py-20 bg-gray-50">
  <div class="container mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center mb-16">
      <h2 class="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
        Why Choose Behulum Logistics
      </h2>
      <p class="text-lg text-gray-700 max-w-3xl mx-auto">
        We combine cutting-edge technology with deep local expertise to deliver
        unmatched logistics services.
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
      <!-- Feature 1 -->
      <div class="bg-white p-8 rounded-lg shadow-md">
        <div
          class="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-6"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h3 class="text-xl font-semibold text-gray-900 mb-3">
          Unmatched Speed
        </h3>
        <p class="text-gray-700">
          Our optimized routes and dedicated fleet ensure your deliveries arrive
          faster than any competitor in Ethiopia.
        </p>
      </div>

      <!-- Feature 2 -->
      <div class="bg-white p-8 rounded-lg shadow-md">
        <div
          class="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-6"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 text-primary"
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
        </div>
        <h3 class="text-xl font-semibold text-gray-900 mb-3">
          Maximum Security
        </h3>
        <p class="text-gray-700">
          Advanced tracking systems and secure warehouses protect your valuable
          goods throughout the logistics chain.
        </p>
      </div>

      <!-- Feature 3 -->
      <div class="bg-white p-8 rounded-lg shadow-md">
        <div
          class="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-6"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 text-primary"
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
        <h3 class="text-xl font-semibold text-gray-900 mb-3">
          Transparent Pricing
        </h3>
        <p class="text-gray-700">
          No hidden fees or surprises. Our clear pricing structure ensures you
          know exactly what you're paying for.
        </p>
      </div>
    </div>
  </div>
</section>

<!-- Testimonials Section -->
<section class="py-20 bg-white">
  <div class="container mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center mb-16">
      <h2 class="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
        What Our Clients Say
      </h2>
      <p class="text-lg text-gray-700 max-w-3xl mx-auto">
        Don't just take our word for it. Here's what businesses across Ethiopia
        are saying about our services.
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
      {#each testimonials as testimonial, i}
        <div class="bg-white p-8 rounded-lg shadow-md border border-gray-100">
          <div class="flex items-center mb-6">
            <img
              src={testimonial.image}
              alt={testimonial.name}
              class="w-14 h-14 rounded-full mr-4"
            />
            <div>
              <h4 class="font-semibold text-gray-900">{testimonial.name}</h4>
              <p class="text-sm text-gray-600">{testimonial.position}</p>
            </div>
          </div>
          <p class="text-gray-700 italic">"{testimonial.quote}"</p>
          <div class="mt-4 flex">
            {#each Array(5) as _, j}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5 text-yellow-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
                />
              </svg>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
</section>

<!-- CTA Section -->
<section class="py-20 bg-primary">
  <div class="container mx-auto px-4 sm:px-6 lg:px-8">
    <div class="max-w-4xl mx-auto text-center">
      <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">
        Ready to Transform Your Logistics?
      </h2>
      <p class="text-xl text-primary-100 mb-8">
        Join hundreds of businesses across Ethiopia who trust Behulum Logistics
        for their critical shipments.
      </p>
      <div
        class="flex flex-col sm:flex-row justify-center space-y-4 sm:space-y-0 sm:space-x-4"
      >
        <a
          href="/auth"
          class="btn bg-white text-primary hover:bg-gray-100 px-8 py-4 rounded-md text-lg font-medium transition-all duration-300 transform hover:scale-105 shadow-lg"
        >
          Get Started Now
        </a>
        <a
          href="/contact"
          class="btn border-2 border-white text-white hover:bg-white hover:text-primary px-8 py-4 rounded-md text-lg font-medium transition-all duration-300"
        >
          Contact Sales
        </a>
      </div>
    </div>
  </div>
</section>

<!-- FAQ Section -->
<section class="py-20 bg-gray-50">
  <div class="container mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center mb-16">
      <h2 class="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
        Frequently Asked Questions
      </h2>
      <p class="text-lg text-gray-700 max-w-3xl mx-auto">
        Get answers to common questions about our logistics services.
      </p>
    </div>

    <div class="max-w-3xl mx-auto">
      <div class="space-y-6">
        <!-- FAQ Item 1 -->
        <div class="bg-white p-6 rounded-lg shadow-md">
          <h3 class="text-xl font-semibold text-gray-900 mb-3">
            How quickly can you deliver within Addis Ababa?
          </h3>
          <p class="text-gray-700">
            For standard deliveries within Addis Ababa, we typically deliver
            within 24 hours. Our express service can deliver within 3-6 hours
            depending on the location and traffic conditions.
          </p>
        </div>

        <!-- FAQ Item 2 -->
        <div class="bg-white p-6 rounded-lg shadow-md">
          <h3 class="text-xl font-semibold text-gray-900 mb-3">
            Do you offer warehousing outside of Addis Ababa?
          </h3>
          <p class="text-gray-700">
            Yes, we have warehouse facilities in major cities including Dire
            Dawa, Hawassa, Bahir Dar, and Mekelle. Each facility is equipped
            with modern inventory management systems and security.
          </p>
        </div>

        <!-- FAQ Item 3 -->
        <div class="bg-white p-6 rounded-lg shadow-md">
          <h3 class="text-xl font-semibold text-gray-900 mb-3">
            How does your real-time tracking system work?
          </h3>
          <p class="text-gray-700">
            Our proprietary tracking system uses GPS technology to monitor
            shipments in real-time. Customers can access this information
            through our web portal or mobile app, receiving updates at every
            stage of delivery.
          </p>
        </div>

        <!-- FAQ Item 4 -->
        <div class="bg-white p-6 rounded-lg shadow-md">
          <h3 class="text-xl font-semibold text-gray-900 mb-3">
            What types of businesses do you typically work with?
          </h3>
          <p class="text-gray-700">
            We serve a wide range of businesses from e-commerce and retail to
            manufacturing and pharmaceuticals. Our solutions are customized to
            meet the specific needs of each industry and business size.
          </p>
        </div>
      </div>

      <div class="text-center mt-10">
        <a
          href="/faq"
          class="text-primary font-medium hover:text-primary-dark transition-colors duration-300"
        >
          View all FAQs →
        </a>
      </div>
    </div>
  </div>
</section>

<style>
  /* Add any additional custom styles here */
  :global(.btn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
</style>
