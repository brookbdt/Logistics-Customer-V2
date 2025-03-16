<script lang="ts">
	// Team members data
	const teamMembers = [
		{
			name: 'Abebe Bekele',
			position: 'Founder & CEO',
			image: 'https://randomuser.me/api/portraits/men/32.jpg',
			bio: 'With over 15 years of experience in logistics and supply chain management, Abebe founded Behulum Logistics with a vision to transform the logistics industry in Ethiopia.'
		},
		{
			name: 'Sara Hailu',
			position: 'Chief Operations Officer',
			image: 'https://randomuser.me/api/portraits/women/44.jpg',
			bio: 'Sara oversees all operational aspects of Behulum Logistics, ensuring efficient service delivery and customer satisfaction across all our service lines.'
		},
		{
			name: 'Dawit Mekonnen',
			position: 'Chief Technology Officer',
			image: 'https://randomuser.me/api/portraits/men/62.jpg',
			bio: 'Dawit leads our technology initiatives, developing innovative solutions that keep Behulum at the forefront of logistics technology in Ethiopia.'
		},
		{
			name: 'Tigist Alemu',
			position: 'Head of Customer Relations',
			image: 'https://randomuser.me/api/portraits/women/68.jpg',
			bio: 'Tigist ensures that our customers receive exceptional service and support, building lasting relationships with businesses across Ethiopia.'
		}
	];

	// Company values
	const values = [
		{
			title: 'Reliability',
			description:
				'We deliver on our promises, every time. Our customers can count on us for consistent, dependable service.',
			icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'
		},
		{
			title: 'Innovation',
			description:
				'We continuously seek new ways to improve our services and operations, embracing technology to drive efficiency.',
			icon: 'M13 10V3L4 14h7v7l9-11h-7z'
		},
		{
			title: 'Excellence',
			description:
				'We strive for excellence in everything we do, from customer service to operational efficiency.',
			icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z'
		},
		{
			title: 'Integrity',
			description:
				'We conduct our business with honesty, transparency, and ethical standards that build trust with our customers and partners.',
			icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'
		}
	];

	// Milestones
	const milestones = [
		{
			year: '1',
			title: 'Company Founded',
			description:
				'Behulum Logistics was established with a small fleet of vehicles and a vision to transform logistics in Ethiopia.'
		},
		{
			year: '2',
			title: 'First Warehouse',
			description:
				'Opened our first warehouse facility in Addis Ababa, expanding our service offerings to include storage solutions.'
		},
		{
			year: '3',
			title: 'Technology Integration',
			description:
				'Launched our proprietary tracking system, allowing customers to monitor their shipments in real-time.'
		},
		{
			year: '4',
			title: 'Regional Expansion',
			description:
				'Expanded operations to major cities across Ethiopia, including Dire Dawa, Hawassa, and Bahir Dar.'
		},
		{
			year: '5',
			title: 'International Partnerships',
			description:
				'Formed strategic partnerships with international logistics companies to facilitate cross-border shipments.'
		},
		{
			year: '6',
			title: 'Digital Transformation',
			description:
				'Launched our mobile app and customer portal, enhancing the customer experience with digital tools.'
		}
	];
</script>

<svelte:head>
	<title>About Us | Behulum Logistics</title>
	<meta
		name="description"
		content="Learn about Behulum Logistics, Ethiopia's premier logistics company. Our story, mission, values, and the team behind our success."
	/>
</svelte:head>

<!-- Hero Section -->
<section class="pt-32 pb-20 bg-gradient-to-br from-primary/10 to-primary/5">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8">
		<div class="max-w-4xl mx-auto text-center">
			<h1 class="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
				About <span class="text-primary">Behulum Logistics</span>
			</h1>
			<p class="text-lg md:text-xl text-gray-700 mb-8">
				Transforming logistics in Ethiopia with innovative solutions and reliable service.
			</p>
		</div>
	</div>
</section>

<!-- Our Story Section -->
<section class="py-16 bg-white">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8">
		<div class="max-w-4xl mx-auto">
			<h2 class="text-3xl font-bold text-gray-900 mb-8 text-center">Our Story</h2>

			<div class="prose prose-lg max-w-none text-gray-700">
				<p>
					Behulum Logistics was founded with a simple yet ambitious mission: to transform the
					logistics industry in Ethiopia through innovation, reliability, and exceptional service.
				</p>

				<p>
					Our founders, recognized the challenges businesses faced with logistics in Ethiopia – from
					unreliable deliveries to lack of transparency in the supply chain. Drawing on his
					extensive experience in logistics and supply chain management, he assembled a team of
					industry experts and technology innovators to create a logistics company that would set
					new standards in the industry.
				</p>

				<p>
					Starting with a small fleet of vehicles and a dedicated team, Behulum quickly gained a
					reputation for reliability and efficiency. We invested heavily in technology, developing
					proprietary systems for tracking, inventory management, and route optimization that gave
					our customers unprecedented visibility and control over their shipments.
				</p>

				<p>
					As we grew, we expanded our services beyond delivery to include warehousing, freight
					forwarding, and specialized logistics solutions tailored to the unique needs of different
					industries. Today, Behulum Logistics operates across Ethiopia, with facilities in major
					cities and a network that reaches even remote areas of the country.
				</p>

				<p>
					Our commitment to innovation continues to drive our growth. We're constantly exploring new
					technologies and approaches to improve our services and create more value for our
					customers. But at the heart of everything we do is our dedication to reliability and
					customer satisfaction – values that have been with us since day one and continue to guide
					our journey.
				</p>
			</div>
		</div>
	</div>
</section>

<!-- Mission & Vision Section -->
<section class="py-16 bg-gray-50">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8">
		<div class="max-w-4xl mx-auto">
			<div class="grid grid-cols-1 md:grid-cols-2 gap-12">
				<div class="bg-white p-8 rounded-lg shadow-md">
					<div class="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-6">
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
								d="M13 10V3L4 14h7v7l9-11h-7z"
							/>
						</svg>
					</div>
					<h3 class="text-2xl font-bold text-gray-900 mb-4">Our Mission</h3>
					<p class="text-gray-700">
						To provide innovative, reliable, and efficient logistics solutions that empower
						businesses across Ethiopia to thrive in an increasingly connected world.
					</p>
				</div>

				<div class="bg-white p-8 rounded-lg shadow-md">
					<div class="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-6">
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
								d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
							/>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
							/>
						</svg>
					</div>
					<h3 class="text-2xl font-bold text-gray-900 mb-4">Our Vision</h3>
					<p class="text-gray-700">
						To be the leading logistics provider in East Africa, known for our innovation,
						reliability, and commitment to excellence, while contributing to the economic growth and
						development of the region.
					</p>
				</div>
			</div>
		</div>
	</div>
</section>

<!-- Our Values Section -->
<section class="py-16 bg-white">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8">
		<div class="max-w-4xl mx-auto text-center mb-12">
			<h2 class="text-3xl font-bold text-gray-900 mb-4">Our Values</h2>
			<p class="text-lg text-gray-700">
				The principles that guide everything we do at Behulum Logistics.
			</p>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 gap-8">
			{#each values as value}
				<div class="bg-gray-50 p-8 rounded-lg">
					<div class="flex items-center mb-4">
						<div class="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mr-4">
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
									d={value.icon}
								/>
							</svg>
						</div>
						<h3 class="text-xl font-bold text-gray-900">{value.title}</h3>
					</div>
					<p class="text-gray-700">{value.description}</p>
				</div>
			{/each}
		</div>
	</div>
</section>

<!-- Milestones Section -->
<section class="py-16 bg-gray-50">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8">
		<div class="max-w-4xl mx-auto text-center mb-12">
			<h2 class="text-3xl font-bold text-gray-900 mb-4">Our Journey</h2>
			<p class="text-lg text-gray-700">Key milestones in the Behulum Logistics story.</p>
		</div>

		<div class="max-w-4xl mx-auto">
			<div class="relative">
				<!-- Timeline Line -->
				<div class="absolute left-1/2 transform -translate-x-1/2 h-full w-1 bg-primary/20" />

				<!-- Timeline Items -->
				{#each milestones as milestone, i}
					<div class="relative z-10 mb-12 last:mb-0">
						<div
							class="flex items-center flex-col md:flex-row {i % 2 === 1
								? 'md:flex-row-reverse'
								: ''}"
						>
							<!-- Year Marker -->
							<div
								class="flex-shrink-0 w-24 h-24 rounded-full bg-primary text-white flex items-center justify-center text-xl font-bold mb-4 md:mb-0 relative z-10"
							>
								{milestone.year}
							</div>

							<!-- Content -->
							<div
								class="md:w-1/2 bg-white p-6 rounded-lg shadow-md {i % 2 === 0
									? 'md:ml-8'
									: 'md:mr-8'}"
							>
								<h3 class="text-xl font-bold text-gray-900 mb-2">{milestone.title}</h3>
								<p class="text-gray-700">{milestone.description}</p>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
</section>

<!-- Team Section -->
<section class="py-16 bg-white">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8">
		<div class="max-w-4xl mx-auto text-center mb-12">
			<h2 class="text-3xl font-bold text-gray-900 mb-4">Our Leadership Team</h2>
			<p class="text-lg text-gray-700">Meet the experienced professionals who drive our success.</p>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
			{#each teamMembers as member}
				<div class="bg-gray-50 rounded-lg overflow-hidden shadow-md">
					<img src={member.image} alt={member.name} class="w-full h-64 object-cover" />
					<div class="p-6">
						<h3 class="text-xl font-bold text-gray-900 mb-1">{member.name}</h3>
						<p class="text-primary font-medium mb-4">{member.position}</p>
						<p class="text-gray-700 text-sm">{member.bio}</p>
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
				Ready to Experience the Behulum Difference?
			</h2>
			<p class="text-xl text-primary-100 mb-8">
				Join hundreds of businesses across Ethiopia who trust us with their logistics needs.
			</p>
			<div class="flex flex-col sm:flex-row justify-center space-y-4 sm:space-y-0 sm:space-x-4">
				<a
					href="/contact"
					class="bg-white text-primary hover:bg-gray-100 px-8 py-4 rounded-md text-lg font-medium transition-all duration-300 transform hover:scale-105 shadow-lg inline-flex items-center justify-center"
				>
					Contact Us Today
				</a>
				<a
					href="/services"
					class="border-2 border-white text-white hover:bg-white hover:text-primary px-8 py-4 rounded-md text-lg font-medium transition-all duration-300 inline-flex items-center justify-center"
				>
					Explore Our Services
				</a>
			</div>
		</div>
	</div>
</section>
