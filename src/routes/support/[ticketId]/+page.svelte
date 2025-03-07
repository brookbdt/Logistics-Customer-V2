<script lang="ts">
  import dayjs from "dayjs";
  import { superForm } from "sveltekit-superforms/client";
  import { toast } from "@zerodevx/svelte-toast";

  export let data;
  export let form;

  const {
    form: addTicketCommentForm,
    enhance: addTicketCommentFormEnhance,
    constraints: addTicketCommentFormConstraints,
    allErrors: addTicketCommentFormErrors,
  } = superForm(data.addTicketCommentForm, {
    onSubmit: async ({ cancel }) => {
      console.log($addTicketCommentForm.text);
      console.log($addTicketCommentForm.reopen);
      if ($addTicketCommentForm.text === "" && !$addTicketCommentForm.reopen) {
        toast.push("Comment cannot be empty");
        cancel();
      }
    },
  });

  $: form?.createComment ? toast.push("Comment Added") : null;
</script>

<div class="mx-8 my-6">
  <div class="">
    <h1 class="text-2xl font-semibold">
      Ticket <span class="text-secondary">{data.ticketDetail?.id}</span> Detail
    </h1>

    <div class="flex items-center justify-between gap-4 mt-2">
      <span class=" text-2xl text-orderCardText font-semibold">
        {data.ticketDetail?.title}</span
      >
      <span class="text-xs font-medium text-black/60 mt-1">
        {data.ticketDetail?.reOpened
          ? "REOPENED"
          : data.ticketDetail?.ticketStatus}
      </span>
    </div>
    <div class="flex gap-10 mt-2">
      {#if data.ticketDetail?.ticketStatus !== "COMPLETED" && data.ticketDetail?.AssignedTo !== null}
        <div class="flex items-center">
          <p class="text-xs text-gray7">Assigned To</p>
          <p class="text-xs text-secondary font-medium ml-1">
            {data.ticketDetail?.AssignedTo?.User.userName}
          </p>
        </div>
      {/if}
      {#if data.ticketDetail?.ticketStatus !== "COMPLETED" && data.ticketDetail?.dueDate}
        <div class="flex items-center">
          <p class="text-xs text-gray7">Due Date:</p>
          <p class="text-xs text-secondary font-medium ml-1">
            {dayjs(data.ticketDetail?.dueDate).format("DD MM YY")}
          </p>
        </div>
      {/if}
    </div>
    <div class="mt-4 border-2 border-secondary rounded-md p-4 shadow-md">
      <p class="font-semibold text-lg text-orderCardText">Description</p>

      <p class=" font-normal mt-1">
        {data.ticketDetail?.description || "No Description"}
      </p>
      {#if data.ticketDetail?.resolution !== null}
        <div class="mt-2 ml-4">
          <p class="font-semibold text-orderCardText">Solution</p>

          <p>{data.ticketDetail?.resolution}</p>
        </div>
      {/if}
    </div>
  </div>
  {#if data.ticketDetail?.resolution !== null}
    <div class="mt-4">
      <div class="font-semibold text-orderCardText mb-2">Comments</div>
      <div class="grid gap-2">
        {#each data.ticketDetail?.Comments || [] as comment}
          <div class="bg-tableHeaderBg shadow-md p-4">
            <div class="flex items-center justify-between">
              <p class="text-primary font-medium">{comment.User.userName}</p>
              <p class="text-black/60 text-xs">
                {dayjs(comment.createdAt).format("DD-MMM-YY")}
              </p>
            </div>
            <p class="text-black/60">{comment.text}</p>
          </div>
        {/each}
      </div>
      <form
        class="mt-4"
        method="post"
        action="?/addComment"
        use:addTicketCommentFormEnhance
      >
        {#if !data.ticketDetail?.reOpened}
          <label>
            <span class="text-xs text-gray7">
              If your issue is not resolved, tick the 'Re-Open' option. You can
              write more details on the comment section below.</span
            >
            <br />
            <input
              type="checkbox"
              bind:checked={$addTicketCommentForm.reopen}
              name="reopen"
              {...$addTicketCommentFormConstraints.reopen}
            />
            <span class="text-lg">Re-Open</span>
          </label>
        {/if}

        <label>
          <div class="label">Comment</div>
          <textarea
            class="textarea h-36 invalid:focus:bg-red-100"
            bind:value={$addTicketCommentForm.text}
            name="text"
            {...$addTicketCommentFormConstraints.text}
          />
        </label>
        <button
          class="bg-secondary flex justify-center items-center rounded-xl h-12 max-w-sm w-full text-white"
          type="submit"
        >
          Submit Comment
        </button>
      </form>
    </div>
  {:else}
    <div class="text-sm italic text-gray7">Waiting For Solution</div>
  {/if}
</div>
