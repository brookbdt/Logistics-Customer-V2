<script lang="ts">
  import { goto } from "$app/navigation";
  import FileUpload from "$lib/assets/shared/file-upload.svg.svelte";
  import Upload from "$lib/assets/shared/upload.svg.svelte";
  import { toast } from "@zerodevx/svelte-toast";
  import { superForm } from "sveltekit-superforms/client";

  export let data;
  export let form;
  let frontFileData: string[] = [];

  const {
    form: addTicketForm,
    enhance,
    errors,
    constraints,
  } = superForm(data.addTicketForm);

  $: form?.addTicketForm ? toast.push("Issue Reported") : null;
  $: form?.addTicketForm ? goto("/support") : null;
</script>

<div class="mx-8 my-6">
  <div class="mb-4">
    <h1 class="text-2xl font-semibold mb-1">Report Issue Form</h1>
    <p class="mt-2 text-sm text-gray7">
      Please fill out the form below to report an issue. Our support team will
      get back to you as soon as possible.
    </p>
  </div>
  <form
    method="post"
    action="?/createTicket"
    use:enhance
    class=" grid gap-6 mt-6"
  >
    <label>
      <div class="label">
        Title <span class="text-red-700 text-xs">*required</span>
      </div>
      <input
        class="input max-w-sm"
        type="text"
        name="title"
        bind:value={$addTicketForm.title}
        {...$constraints.title}
      />
    </label>
    <label>
      <div class="label">
        Description <span class="text-red-700 text-xs">*required</span>
      </div>
      <textarea
        class="textarea max-w-sm h-36"
        name="description"
        bind:value={$addTicketForm.description}
        {...$constraints.description}
      />
    </label>
    <label>
      <input
        class="hidden"
        type="file"
        name="ticketFiles"
        accept="image/*"
        multiple
        on:change={(e) => {
          const data = e.currentTarget.files;
          if (data) {
            for (let i = 0; i <= data?.length; i++) {
              if (data.item(i)) {
                frontFileData = [...frontFileData, data[i].name];
              }
            }
          }
        }}
      />

      <div
        class="flex bg-primary rounded-lg min-w-fit max-w-0 gap-2 items-center justify-center px-6 shadow-md py-2"
      >
        <Upload color="white" />
        <p class="text-white">Upload Ticket files</p>
      </div>
      {#if frontFileData.length}
        <div class="flex flex-wrap gap-6 mt-4">
          {#each frontFileData as file}
            <div class="flex shadow-md bg-white rounded-lg w-56 items-center">
              <FileUpload class="h-6 w-6 flex-shrink-0 ml-2" color="#777777" />
              <p class="text-sm ml-2 flex-1 line-clamp-1 py-2">{file}</p>
            </div>
          {/each}
        </div>
      {/if}
    </label>
    <button
      class="bg-secondary flex justify-center items-center rounded-xl h-12 max-w-sm w-full text-white"
      type="submit"
    >
      Submit Issue
    </button>
  </form>
</div>
