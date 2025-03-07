<script lang="ts">
  import { page } from "$app/stores";
  import GoogleMaps from "$lib/components/google-maps.svelte";
  import StarRating from "$lib/components/star-rating.svelte";
  import { clickOutside } from "$lib/utils/click-outside.js";
  import { toast } from "@zerodevx/svelte-toast";
  import dayjs from "dayjs";
  // import Barcode from "svelte-barcode";
  import { superForm } from "sveltekit-superforms/client";

  export let data;
  export let form;

  let [mapLat, mapLng] = data.orderDetail?.pickUpMapLocation.split(",") || [];
  let [destinationLat, destinationLng] =
    data.orderDetail?.dropOffMapLocation.split(",") || [];
  let [deliveryLat, deliveryLng] =
    data.orderDetail?.Tracker?.mapLocation.split(",") || [];

  let orderRateModal = false;
  let driverRateModal = false;
  let ratingOrder: any;
  let ratingDriver: any;

  $: form?.createOrderRating ? toast.push("Rating submitted") : null;
  $: form?.createOrderRating ? (orderRateModal = false) : null;

  $: form?.createDriverRating ? toast.push("Rating submitted") : null;
  $: form?.createDriverRating ? (driverRateModal = false) : null;

  const {
    form: addOrderRatingForm,
    enhance: addOrderRatingEnhance,
    allErrors: addOrderRatingErrors,
    constraints: addOrderRatingConstraints,
  } = superForm(data.addOrderRatingForm, {
    onSubmit({ formData, cancel }) {
      if (!ratingOrder) {
        toast.push("Please rate the service");
        cancel();
      }
      if (!$page.data.session?.customerData.id) {
        toast.push("Please login to rate the service.");
        cancel();
      }
      formData.set("rating", ratingOrder);
      formData.set(
        "customerId",
        JSON.stringify($page.data.session?.customerData.id)
      );
    },
  });

  const {
    form: addDriverRatingForm,
    enhance: addDriverRatingEnhance,
    allErrors: addDriverRatingErrors,
    constraints: addDriverRatingConstraints,
  } = superForm(data.addDriverRatingForm, {
    onSubmit({ formData, cancel }) {
      if (!ratingDriver) {
        toast.push("Please rate the driver.");
        cancel();
      }
      if (!$page.data.session?.customerData.id) {
        toast.push("Please login to rate the service");
        cancel();
      }
      formData.set("rating", ratingDriver);
      formData.set(
        "customerId",
        JSON.stringify($page.data.session?.customerData.id)
      );
    },
  });
</script>

<div class=" mt-8 mb-16 grid mx-6">
  <!-- <div class="flex justify-center">
    <Barcode
      value={data.orderDetail?.id}
      elementTag={"canvas"}
      options={{
        format: "CODE128",
        width: 4,
        height: 60,
        text: `${data.orderDetail.id}`,
        textAlign: "center",
        textPosition: "bottom",
        textMargin: 2,
        fontSize: 20,
        background: "#ffffff",
        lineColor: "#000000",
      }}
    />
  </div> -->

  <div class="grid grid-cols-2 gap-2 my-4">
    <button
      on:click={() => (orderRateModal = true)}
      class="bg-complementary text-white py-2 rounded-lg"
    >
      Rate Service
    </button>
    <button
      on:click={() => (driverRateModal = true)}
      class="bg-secondary text-white py-2 rounded-lg"
    >
      Rate Courier
    </button>
  </div>
  <div
    class="bg-primary/10 p-4 my-4 rounded-md shadow-md border-[1px] border-primary/50"
  >
    <div class="flex justify-between items-center">
      <span class="font-semibold text-xl text-primary">Order Detail</span>
      <span
        class="text-xs font-medium text-white mt-1 ml-6 border-secondary border-[1px] bg-secondary/60 px-2 py-1 rounded-md"
        >{data.orderDetail?.orderStatus}
      </span>
    </div>
    <div class="bg-white p-1 rounded-md shadow-sm mt-4">
      <GoogleMaps
        display={true}
        destinationLat={Number(destinationLat)}
        destinationLng={Number(destinationLng)}
        lng={Number(mapLng)}
        lat={Number(mapLat)}
        deliveryLat={Number(deliveryLat)}
        deliveryLng={Number(deliveryLng)}
      />
    </div>
    <div class="mt-4">
      <div class="flex items-center">
        <span class="font-semibold text-lg mr-4 text-tertiary">To</span>
        <div class="text-primary font-light">
          {data.orderDetail?.receiverName
            ? data.orderDetail?.receiverName
            : data.orderDetail?.Receiver?.User.userName || ""} | {data
            .orderDetail?.receiverPhoneNumber
            ? data.orderDetail?.receiverPhoneNumber
            : data.orderDetail?.Receiver?.User.phoneNumber || ""}
        </div>
      </div>
      <span class="font-semibold w-full text-lg mt-2 text-tertiary"
        >Pick Up</span
      >
      <div class="">
        {data.orderDetail?.pickUpPhysicalLocation} -
        {dayjs(data.orderDetail?.pickUpTime).format("MMM DD/YY ")}
      </div>
      <span class="font-semibold text-lg mt-2 text-tertiary">Drop Off</span>

      <div class="">
        {data.orderDetail?.dropOffPhysicalLocation} -
        {dayjs(data.orderDetail?.dropOffTime).format("MMM DD/YY")}
      </div>
      <span class="font-semibold text-lg text-tertiary">Payment</span>
      <div class="">
        <span class="font-semibold">Amount:</span>
        {data.orderDetail?.paymentAmount}

        <span class="font-semibold">Method:</span>
        {data.orderDetail?.paymentMethod} -
        {dayjs(data.orderDetail?.paymentDate).format("MMM DD/YY")}
      </div>
    </div>
  </div>

  <div
    class="bg-primary/10 p-4 my-4 rounded-md shadow-md border-[1px] border-primary/50"
  >
    <p class="font-semibold text-lg text-primary">Milestones</p>
    {#if data.orderDetail}
      {#each data.orderDetail.orderMilestone as milestone}
        <div class="grid">
          <label>
            <input
              disabled
              checked={milestone.isCompleted}
              type="checkbox"
              class="mr-2"
              name="milestones"
            />{milestone.description}
          </label>
        </div>
      {/each}
    {/if}
  </div>
  {#if data.orderDetail?.Dispatch?.AssignedEmployee || data.orderDetail?.Dispatch?.AssignedVendorDriver}
    <div
      class="bg-primary/10 border-[1px] border-primary/50 p-4 my-4 rounded-md shadow-md"
    >
      <span class="font-semibold text-lg text-primary">Current Driver</span>
      <div class="text-primary font-light">
        {data.orderDetail?.Dispatch?.AssignedEmployee?.User.userName ??
          data.orderDetail?.Dispatch?.AssignedVendorDriver?.User.userName ??
          ""}
      </div>
      <div class="font-light mt-1">
        {data.orderDetail?.Dispatch?.AssignedEmployee?.User.phoneNumber ??
          data.orderDetail?.Dispatch?.AssignedVendorDriver?.User.phoneNumber ??
          ""}
      </div>
    </div>
  {/if}
  <div
    class="bg-primary/10 border-[1px] border-primary/50 p-4 my-4 rounded-md shadow-md grid gap-2"
  >
    <span class="font-semibold text-lg text-primary"> Order Ratings </span>
    {#each data.orderDetail.OrderRating as rating}
      <div>
        <p class="font-semibold text-tertiary">
          {rating.Customer?.User.userName}
        </p>
        <StarRating rating={rating.rating} />
        <p>{rating.comment}</p>
      </div>
    {/each}
  </div>
</div>

{#if orderRateModal}
  <div
    class="bg-black/70 fixed top-0 left-0 z-50 w-full h-screen overflow-auto"
  >
    <div
      use:clickOutside={() => (orderRateModal = false)}
      class="bg-white mx-auto my-16 rounded-xl p-8 w-[360px] grid gap-4 justify-items-stretch"
    >
      <form use:addOrderRatingEnhance method="post" action="?/addOrderRating">
        <div class="text-center text-xl font-semibold">
          Rate Order Experience
        </div>
        <hr class="my-4" />
        <div class="flex justify-center my-4">
          <StarRating bind:rating={ratingOrder} />
        </div>
        <div class="">
          <label for="serviceComment" class="font-medium text-lg">
            Comment</label
          >
          <textarea
            bind:value={$addOrderRatingForm.comment}
            {...$addOrderRatingConstraints.comment}
            id="serviceComment"
            name="comment"
            class="textarea h-44"
          />
        </div>

        <button
          type="submit"
          class="bg-complementary w-full text-white py-2 rounded-lg"
        >
          Submit
        </button>
      </form>
    </div>
  </div>
{/if}

{#if driverRateModal}
  <div
    class="bg-black/70 fixed top-0 left-0 z-50 w-full h-screen overflow-auto"
  >
    <div
      use:clickOutside={() => (driverRateModal = false)}
      class="bg-white mx-auto my-16 rounded-md p-8 w-[360px] grid gap-4 justify-items-stretch"
    >
      <form use:addDriverRatingEnhance method="post" action="?/addDriverRating">
        <div class="text-center text-xl font-semibold">
          Rate Driver Experience
        </div>
        <hr class="my-4" />
        <label>
          <div class="label">Select Driver</div>
          <select
            bind:value={$addDriverRatingForm.driverUserId}
            {...$addDriverRatingConstraints.driverUserId}
            class="input max-w-md"
            name="driverUserId"
          >
            {#each data.orderDetail.OrderDispatch as ds}
              <option
                value={ds.Dispatch.AssignedEmployee?.User.id ??
                  ds.Dispatch.AssignedVendorDriver?.User.id}
              >
                {ds.Dispatch.AssignedEmployee?.User.userName ??
                  ds.Dispatch.AssignedVendorDriver?.User.userName}
              </option>
            {/each}
          </select>
        </label>
        <div
          class=" bg-tertiary/10 my-4 border-[1px] p-2 border-tertiary rounded-md"
        >
          <span class="text-primary"> Rate </span>
          <StarRating bind:rating={ratingDriver} />
        </div>
        <div class="">
          <label for="serviceComment" class="label"> Comment</label>
          <textarea
            bind:value={$addDriverRatingForm.comment}
            {...$addDriverRatingConstraints.comment}
            id="driverComment"
            name="comment"
            class="textarea h-44"
          />
        </div>

        <button
          type="submit"
          class="bg-complementary w-full text-white py-2 rounded-lg"
        >
          Submit
        </button>
      </form>
    </div>
  </div>
{/if}
