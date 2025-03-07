<script lang="ts">
  import Add from "$lib/assets/shared/add.svg.svelte";
  import dayjs from "dayjs";

  export let data;
</script>

<div class="mx-8 my-6">
  <div class="mb-4">
    <h1 class="text-2xl font-semibold mb-1">Customer Support</h1>
    <p class="text-gray7 mb-1">
      Welcome to the support page. Here you can create a new issue or view
      existing issues.
    </p>
    <div class="">
      <p class="font-semibold text-sm text-complementary mb-1">
        log@mail.com, superadmin@mail.com
      </p>
      <p class="font-semibold text-sm text-primary">
        +251 912 456 789, +251 912 456 789
      </p>
    </div>
  </div>
  <a href="/support/create-issue">
    <div
      class="bg-secondary shadow-md text-center rounded-lg text-lg py-3 max-w-sm text-white"
    >
      Create an Issue
    </div>
  </a>
  <div class="my-4 grid gap-2">
    {#each data.tickets as ticket}
      <a
        href="/support/{ticket.id}"
        class="bg-primary/10 shadow-md w-auto rounded-md p-4 grid"
      >
        <div class="flex items-center justify-between gap-4">
          <span class=" text-lg text-tertiary font-medium">
            <span class="font-semibold"> ID {ticket.id}: </span>
            {ticket.title}</span
          >
          <span class="text-xs font-medium text-black/60">
            {ticket.ticketStatus}
          </span>
        </div>
        <!-- <div class="text-gray7 text-xs">Ticket</div> -->

        <div class="flex justify-between">
          {#if ticket.AssignedTo !== null}
            <div class="flex items-center">
              <p class="text-xs text-gray7">Assigned To</p>
              <p class="text-xs text-primary font-medium ml-1">
                {ticket.AssignedTo?.User.userName}
              </p>
            </div>
          {/if}
          {#if ticket.dueDate}
            <div class="flex items-center">
              <p class="text-xs text-gray7">Due Date:</p>
              <p class="text-xs text-primary font-medium ml-1">
                {dayjs(ticket.dueDate).format("DD MM YY")}
              </p>
            </div>
          {/if}
        </div>

        <div class="mt-2">
          <p class=" text-sm font-normal line-clamp-3">
            {ticket.description || "No Description"}
          </p>
        </div>
      </a>
    {/each}
  </div>
</div>
