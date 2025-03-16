<script>
  import { onMount } from "svelte";

  onMount(() => {
    document.title = "Privacy Policy | Behulum";
  });
</script>

<div class="container mx-auto px-4 py-8 max-w-4xl">
  <h1 class="text-3xl font-bold mb-6">Privacy Policy</h1>

  <div class="prose prose-lg">
    <p class="mb-4">
      Last updated: {new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })}
    </p>

    <h2 class="text-2xl font-semibold mt-6 mb-3">Introduction</h2>
    <p>
      At Behulum, we respect your privacy and are committed to protecting your
      personal data. This Privacy Policy explains how we collect, use, disclose,
      and safeguard your information when you use our logistics services.
    </p>

    <h2 class="text-2xl font-semibold mt-6 mb-3">Information We Collect</h2>
    <p>We may collect the following types of information:</p>
    <ul class="list-disc pl-6 mb-4">
      <li>
        Personal identification information (Name, email address, phone number,
        etc.)
      </li>
      <li>Shipping and delivery information</li>
      <li>Payment information</li>
      <li>Device and usage information</li>
      <li>Location data (with your consent)</li>
    </ul>

    <h2 class="text-2xl font-semibold mt-6 mb-3">
      How We Use Your Information
    </h2>
    <p>We use the information we collect to:</p>
    <ul class="list-disc pl-6 mb-4">
      <li>Provide, maintain, and improve our services</li>
      <li>Process and complete transactions</li>
      <li>Send you order confirmations and updates</li>
      <li>Respond to your comments and questions</li>
      <li>Personalize your experience</li>
      <li>Monitor and analyze usage patterns</li>
      <li>Protect against fraudulent or unauthorized transactions</li>
    </ul>

    <h2 class="text-2xl font-semibold mt-6 mb-3">Information Sharing</h2>
    <p>
      We may share your information with third parties in certain circumstances:
    </p>
    <ul class="list-disc pl-6 mb-4">
      <li>With service providers who perform services on our behalf</li>
      <li>To comply with legal obligations</li>
      <li>To protect and defend our rights and property</li>
      <li>With your consent or at your direction</li>
    </ul>

    <h2 class="text-2xl font-semibold mt-6 mb-3">Data Security</h2>
    <p>
      We implement appropriate security measures to protect your personal
      information. However, no method of transmission over the Internet or
      electronic storage is 100% secure, and we cannot guarantee absolute
      security.
    </p>

    <h2 class="text-2xl font-semibold mt-6 mb-3">Your Rights</h2>
    <p>
      Depending on your location, you may have certain rights regarding your
      personal information, including the right to access, correct, delete, or
      restrict processing of your data.
    </p>

    <h2 class="text-2xl font-semibold mt-6 mb-3">
      Changes to This Privacy Policy
    </h2>
    <p>
      We may update our Privacy Policy from time to time. We will notify you of
      any changes by posting the new Privacy Policy on this page and updating
      the "Last updated" date.
    </p>

    <h2 class="text-2xl font-semibold mt-6 mb-3">Contact Us</h2>
    <p>
      If you have any questions about this Privacy Policy, please contact us at:
    </p>
    <p class="mt-2">
      <strong>Email:</strong> support@behulum.com<br />
      <strong>Address:</strong> [Your Company Address]
    </p>
  </div>
</div>
