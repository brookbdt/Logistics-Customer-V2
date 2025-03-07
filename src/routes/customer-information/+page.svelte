<script lang="ts">
  import { browser } from "$app/environment";
  import { enhance } from "$app/forms";
  import { goto } from "$app/navigation";
  import Image from "$lib/assets/shared/image.svg.svelte";
  import GoogleMaps from "$lib/components/google-maps.svelte";
  import { signOut } from "@auth/sveltekit/client";
  import { superForm } from "sveltekit-superforms/client";

  export let data;
  export let form;

  const {
    form: customerInformationForm,
    enhance: customerInformationEnhance,
    allErrors,
    constraints,
  } = superForm(data.customerInformationForm);

  let edit = true;

  let center = [9.0046464, 38.797312];
  let zoom = 7;

  $: console.log({ center: $customerInformationForm });

  // Split the mapLocation string into its lat and lng components
  let [mapLat, mapLng] = $customerInformationForm.mapAddress?.split(",") || [];
  // If both lat and lng are present, update the center variable
  if (mapLat && mapLng) {
    console.log({ mapLat, mapLng });
    center = [Number(mapLat), Number(mapLng)];
  } else if (browser) {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log("User location:", position);
          center = [position.coords.latitude, position.coords.longitude];
        },
        (error) => {
          console.error("Error getting user location:", error);
        }
      );
    } else {
      // Geolocation is not supported by the browser
      console.error("Geolocation is not supported by this browser.");
    }
  }

  $: form?.updatedCustomer ? goto("/") : null;
</script>

<div class="p-6 grid justify-items-center">
  <form
    method="post"
    action="?/uploadProfilePicture"
    enctype="multipart/form-data"
    use:enhance={({ formData }) => {
      if (!data.session) {
        return;
      }
      formData.set(
        "profileKey",
        `customerProfilePicture/${data.session.customerData.id}`
      );
    }}
  >
    <label>
      <input
        class="hidden"
        type="file"
        name="profilePicture"
        accept="image/*"
        on:change={(e) => {
          e.currentTarget.form?.requestSubmit();
        }}
      />
      {#if data.imgUrl}
        <img
          alt="dp"
          src={data.imgUrl}
          class=" rounded-full mb-4 h-48 w-48 object-cover"
        />
      {:else}
        <Image class="mb-4 h-24 w-24" />
      {/if}
    </label>
    <!-- <button type="submit"> submit </button> -->
  </form>

  {#if !data.customerInformationForm.data.premium}
    <button
      class="px-6 h-10 my-6 border-[1px] border-secondary text-xs font-semibold text-secondary rounded-xl justify-self-center"
    >
      Upgrade to Premium</button
    >
  {/if}

  {#if !data.session?.customerData.customerType}
    <p class="text-sm font-medium text-complementary">
      Please provide the customer information
    </p>
  {/if}
  <form
    class="grid gap-6 mt-4"
    method="post"
    action="?/updateCustomer"
    use:customerInformationEnhance
  >
    <label>
      <div
        class="label {!data.session?.userData.userName
          ? 'text-complementary'
          : ''}"
      >
        User Name
      </div>
      <input
        class="input w-72 max-w-sm"
        type="text"
        name="userName"
        bind:value={$customerInformationForm.userName}
        {...$constraints.userName}
      />
    </label>
    <label>
      <div
        class="label {!data.session?.userData.email
          ? 'text-complementary'
          : ''}"
      >
        Email
      </div>
      <input
        class="input max-w-sm"
        type="text"
        name="email"
        bind:value={$customerInformationForm.email}
        {...$constraints.email}
      />
    </label>
    <label>
      <div
        class="label {!data.session?.userData.phoneNumber
          ? 'text-complementary'
          : ''}"
      >
        Phone Number
      </div>
      <input
        class="input max-w-sm"
        type="text"
        name="phoneNumber"
        bind:value={$customerInformationForm.phoneNumber}
        {...$constraints.phoneNumber}
      />
    </label>
    <label>
      <div
        class="label {!data.session?.customerData.physicalAddress
          ? 'text-complementary'
          : ''}"
      >
        Physical Address
      </div>
      <input
        class="input max-w-sm"
        type="text"
        name="physicalAddress"
        bind:value={$customerInformationForm.physicalAddress}
        {...$constraints.physicalAddress}
      />
    </label>
    <label>
      <div
        class="label {!data.session?.customerData.customerType
          ? 'text-complementary'
          : ''}"
      >
        Customer Type
      </div>
      <select
        bind:value={$customerInformationForm.customerType}
        class="input max-w-sm"
        name="customerType"
        on:change={() => (edit = false)}
      >
        <option selected disabled>Not selected</option>
        <option value={"BUSINESS"}> Business </option>
        <option value={"RESIDENTIAL"}> Residential </option>
      </select>
    </label>
    {#if $customerInformationForm.customerType === "BUSINESS"}
      <label>
        <div class="labe">Company Name</div>
        <input
          class="input w-72 max-w-sm"
          type="text"
          name="companyName"
          bind:value={$customerInformationForm.companyName}
          {...$constraints.companyName}
        />
      </label>
      <label>
        <div class="labe">TIN</div>
        <input
          class="input w-72 max-w-sm"
          type="text"
          name="tin"
          bind:value={$customerInformationForm.tin}
          {...$constraints.tin}
        />
      </label>
    {/if}

    <div class="h-fit bg-primary/10 p-2 flex-1">
      <GoogleMaps bind:lat={center[0]} bind:lng={center[1]} />
    </div>
    <label>
      <div
        class="label {!data.session?.customerData.mapAddress
          ? 'text-complementary'
          : ''}"
      >
        Map Address
      </div>
      <input
        class="input max-w-sm"
        type="text"
        name="mapAddress"
        value={`${center[0]},${center[1]}`}
      />
    </label>
    <button
      class="bg-secondary flex justify-center items-center rounded-xl h-12 max-w-sm text-white"
    >
      Submit
    </button>
  </form>
  <hr />
  <button
    on:click={() => signOut()}
    class="bg-complementary w-72 mt-6 flex justify-center items-center rounded-xl h-12 max-w-sm text-white"
  >
    Logout
  </button>
</div>
