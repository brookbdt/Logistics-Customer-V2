<script>
  import { onMount } from "svelte";

  onMount(() => {
    document.title = "Terms of Service | Behulum";
  });
</script>

<div class="container mx-auto px-4 py-8 max-w-4xl">
  <h1 class="text-3xl font-bold mb-6">Terms of Service</h1>

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
      Welcome to Behulum. These Terms of Service ("Terms") govern your use of
      our website, mobile application, and logistics services (collectively, the
      "Services"). By accessing or using our Services, you agree to be bound by
      these Terms and our Privacy Policy.
    </p>

    <h2 class="text-2xl font-semibold mt-6 mb-3">Use of Services</h2>
    <p>
      You may use our Services only for lawful purposes and in accordance with
      these Terms. You agree not to:
    </p>
    <ul class="list-disc pl-6 mb-4">
      <li>
        Use the Services in any way that violates applicable laws or regulations
      </li>
      <li>
        Use the Services to transmit harmful code or interfere with the
        operation of our Services
      </li>
      <li>
        Attempt to gain unauthorized access to any portion of the Services
      </li>
      <li>Use the Services to harass, abuse, or harm another person</li>
      <li>Use our Services for any fraudulent or deceptive purpose</li>
    </ul>

    <h2 class="text-2xl font-semibold mt-6 mb-3">User Accounts</h2>
    <p>
      When you create an account with us, you must provide accurate and complete
      information. You are responsible for maintaining the confidentiality of
      your account credentials and for all activities that occur under your
      account.
    </p>

    <h2 class="text-2xl font-semibold mt-6 mb-3">Orders and Payments</h2>
    <p>
      By placing an order through our Services, you agree to pay all charges at
      the prices in effect when your order is submitted. All payments are
      non-refundable except as expressly set forth in our Refund Policy.
    </p>

    <h2 class="text-2xl font-semibold mt-6 mb-3">Shipping and Delivery</h2>
    <p>
      We strive to deliver your items within the estimated delivery timeframes.
      However, delivery times are not guaranteed and may be affected by factors
      beyond our control. We are not liable for any delays in delivery.
    </p>

    <h2 class="text-2xl font-semibold mt-6 mb-3">Intellectual Property</h2>
    <p>
      The Services and all content and materials included on the Services,
      including but not limited to text, graphics, logos, images, and software,
      are the property of Behulum or its licensors and are protected by
      copyright, trademark, and other intellectual property laws.
    </p>

    <h2 class="text-2xl font-semibold mt-6 mb-3">Limitation of Liability</h2>
    <p>
      To the maximum extent permitted by law, Behulum shall not be liable for
      any indirect, incidental, special, consequential, or punitive damages, or
      any loss of profits or revenues, whether incurred directly or indirectly,
      or any loss of data, use, goodwill, or other intangible losses.
    </p>

    <h2 class="text-2xl font-semibold mt-6 mb-3">Indemnification</h2>
    <p>
      You agree to indemnify, defend, and hold harmless Behulum and its
      officers, directors, employees, agents, and affiliates from and against
      any claims, liabilities, damages, losses, and expenses, including
      reasonable attorneys' fees, arising out of or in any way connected with
      your access to or use of the Services.
    </p>

    <h2 class="text-2xl font-semibold mt-6 mb-3">Changes to Terms</h2>
    <p>
      We may revise these Terms from time to time. The most current version will
      always be posted on our website. By continuing to use our Services after
      revisions become effective, you agree to be bound by the revised Terms.
    </p>

    <h2 class="text-2xl font-semibold mt-6 mb-3">Governing Law</h2>
    <p>
      These Terms shall be governed by and construed in accordance with the laws
      of [Your Jurisdiction], without regard to its conflict of law provisions.
    </p>

    <h2 class="text-2xl font-semibold mt-6 mb-3">Contact Us</h2>
    <p>If you have any questions about these Terms, please contact us at:</p>
    <p class="mt-2">
      <strong>Email:</strong> support@behulum.com<br />
      <strong>Address:</strong> [Your Company Address]
    </p>
  </div>
</div>
