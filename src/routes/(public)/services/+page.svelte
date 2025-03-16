<script lang="ts">
	import { onMount } from 'svelte';

	// Services data with detailed information
	const services = [
		{
			id: 'express',
			title: 'Express Delivery',
			description: 'Fast, reliable delivery services across Ethiopia.',
			icon: 'M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1z',
			image:
				'https://images.unsplash.com/photo-1601628828688-632f38a5a7d0?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80',
			features: [
				'Same-day delivery within Addis Ababa',
				'Next-day delivery to major Ethiopian cities',
				'Real-time tracking and notifications',
				'Secure handling of packages',
				'Proof of delivery with digital signatures',
				'Insurance options for valuable items'
			],
			details:
				"Our Express Delivery service is designed for businesses and individuals who need their packages delivered quickly and reliably. We utilize optimized routes and a dedicated fleet of vehicles to ensure your deliveries arrive on time, every time. With our advanced tracking system, you can monitor your package's journey from pickup to delivery in real-time."
		},
		{
			id: 'warehouse',
			title: 'Warehousing Solutions',
			description: 'State-of-the-art storage facilities across Ethiopia.',
			icon: 'M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z',
			image:
				'https://images.unsplash.com/photo-1553413077-190dd305871c?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80',
			features: [
				'Climate-controlled storage options',
				'24/7 security with CCTV monitoring',
				'Inventory management system',
				'Barcode scanning and tracking',
				'Flexible storage space options',
				'Cross-docking capabilities'
			],
			details:
				'Our warehousing solutions provide businesses with secure, efficient storage facilities equipped with modern inventory management systems. Whether you need short-term storage or a long-term warehousing partner, our facilities in Addis Ababa, Dire Dawa, Hawassa, and other major cities offer flexible options to meet your needs. Our advanced inventory management system allows you to track your stock levels in real-time.'
		},
		{
			id: 'freight',
			title: 'Freight Forwarding',
			description: 'Comprehensive import/export services for businesses.',
			icon: 'M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1z',
			image:
				'https://images.unsplash.com/photo-1578575437130-527eed3abbec?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80',
			features: [
				'Import and export documentation',
				'Customs clearance assistance',
				'Duty and tax calculation',
				'Regulatory compliance support',
				'International shipping coordination',
				'Cargo insurance options'
			],
			details:
				'Our Freight Forwarding service simplifies the complex process of international shipping and customs clearance. We handle all aspects of import and export logistics, from documentation and customs clearance to final delivery. Our experienced team navigates the regulatory requirements to ensure your goods move smoothly across borders, saving you time and reducing the risk of delays or penalties.'
		},
		{
			id: 'tracking',
			title: 'Real-time Tracking',
			description: 'Advanced GPS tracking for complete shipment visibility.',
			icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7',
			image:
				'https://images.unsplash.com/photo-1512758017271-d7b84c2113f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80',
			features: [
				'GPS tracking of all shipments',
				'Mobile app for real-time updates',
				'Automated delivery notifications',
				'Detailed delivery reports',
				'Route optimization',
				'Estimated time of arrival predictions'
			],
			details:
				'Our Real-time Tracking system provides complete visibility of your shipments throughout the delivery process. Using advanced GPS technology, our platform allows you to monitor the exact location of your packages, receive automated notifications at key milestones, and access detailed delivery reports. This transparency helps you manage your supply chain more effectively and provide better service to your customers.'
		}
	];

	// Scroll to service section if hash is present
	onMount(() => {
		if (window.location.hash) {
			const id = window.location.hash.substring(1);
			const element = document.getElementById(id);
			if (element) {
				setTimeout(() => {
					element.scrollIntoView({ behavior: 'smooth' });
				}, 100);
			}
		}
	});
</script>

<svelte:head>
	<title>Our Services | Behulum Logistics</title>
	<meta
		name="description"
		content="Explore Behulum Logistics' premium services including express delivery, warehousing, freight forwarding, and real-time tracking solutions across Ethiopia."
	/>
</svelte:head>

<!-- Hero Section -->
<section class="pt-32 pb-20 bg-gradient-to-br from-primary/10 to-primary/5">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8">
		<div class="max-w-4xl mx-auto text-center">
			<h1 class="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
				Our Premium <span class="text-primary">Logistics Services</span>
			</h1>
			<p class="text-lg md:text-xl text-gray-700 mb-8">
				Comprehensive solutions designed to meet the unique logistics needs of businesses across
				Ethiopia.
			</p>
		</div>
	</div>
</section>

<!-- Services Section -->
<section class="py-16 bg-white">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8">
		{#each services as service, i}
			<div id={service.id} class="py-16 border-b border-gray-200 last:border-0">
				<div
					class="flex flex-col md:flex-row items-center {i % 2 === 1 ? 'md:flex-row-reverse' : ''}"
				>
					<div class="md:w-1/2 mb-8 md:mb-0 {i % 2 === 0 ? 'md:pr-12' : 'md:pl-12'}">
						<img
							src={service.image}
							alt={service.title}
							class="rounded-lg shadow-xl w-full h-80 object-cover"
						/>
					</div>

					<div class="md:w-1/2">
						<div class="flex items-center mb-4">
							<div
								class="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mr-4"
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
										stroke-width="1.5"
										d={service.icon}
									/>
								</svg>
							</div>
							<h2 class="text-3xl font-bold text-gray-900">{service.title}</h2>
						</div>

						<p class="text-lg text-gray-700 mb-6">{service.details}</p>

						<h3 class="text-xl font-semibold text-gray-900 mb-4">Key Features</h3>
						<ul class="space-y-3 mb-8">
							{#each service.features as feature}
								<li class="flex items-start">
									<svg
										class="h-6 w-6 text-primary mr-2 flex-shrink-0"
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
									<span class="text-gray-700">{feature}</span>
								</li>
							{/each}
						</ul>

						<a
							href="/contact"
							class="inline-flex items-center bg-primary hover:bg-primary-dark text-white px-6 py-3 rounded-md transition-colors duration-300"
						>
							<span>Request a Quote</span>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5 ml-2"
								viewBox="0 0 20 20"
								fill="currentColor"
							>
								<path
									fill-rule="evenodd"
									d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z"
									clip-rule="evenodd"
								/>
							</svg>
						</a>
					</div>
				</div>
			</div>
		{/each}
	</div>
</section>

<!-- CTA Section -->
<section class="py-20 bg-primary">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8">
		<div class="max-w-4xl mx-auto text-center">
			<h2 class="text-3xl md:text-4xl font-bold text-white mb-6">
				Ready to Optimize Your Logistics?
			</h2>
			<p class="text-xl text-primary-100 mb-8">
				Contact our team today to discuss how our services can be tailored to your specific business
				needs.
			</p>
			<div class="flex flex-col sm:flex-row justify-center space-y-4 sm:space-y-0 sm:space-x-4">
				<a
					href="/contact"
					class="bg-white text-primary hover:bg-gray-100 px-8 py-4 rounded-md text-lg font-medium transition-all duration-300 transform hover:scale-105 shadow-lg inline-flex items-center justify-center"
				>
					Contact Us Today
				</a>
				<a
					href="/auth/signup"
					class="border-2 border-white text-white hover:bg-white hover:text-primary px-8 py-4 rounded-md text-lg font-medium transition-all duration-300 inline-flex items-center justify-center"
				>
					Create an Account
				</a>
			</div>
		</div>
	</div>
</section>
