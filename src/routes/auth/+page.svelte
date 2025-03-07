<script lang="ts">
  import { page } from "$app/stores";
  import ArrowRight from "$lib/assets/icons/arrow-right.svg.svelte";
  import Logo from "$lib/assets/shared/logo.svg.svelte";
  import { signIn } from "@auth/sveltekit/client";
  import { toast } from "@zerodevx/svelte-toast";
  import { superForm } from "sveltekit-superforms/client";

  export let data;
  export let form;

  const {
    form: sendEmailForm,
    enhance,
    allErrors,
    constraints,
  } = superForm(data.sendEmailForm);

  $: for (const error of $allErrors) {
    toast.push(error.messages.join(" "));
  }
  $: form?.emailSent
    ? toast.push("Please check your email for sign up link", {
        duration: 10000,
      })
    : null;
</script>

<div class="grid justify-items-stretch place-content-center h-screen">
  {#if !$page.data.session}
    <Logo class="w-40 h-40 justify-self-center mb-12" />
    <p class="text-4xl justify-self-center mb-6">Admin Portal</p>
    <!-- <button class="justify-self-center mb-12 text-linkedText underline" on:click={showModal}
			>Sign up</button
		> -->

    <form method="post" action="?/sendEmail" use:enhance>
      <!-- <InputField label="Email" placeholder="email" inputType="email" name="email" required /> -->
      <label>
        <div class="label">Email</div>
        <input
          class="input"
          type="email"
          name="email"
          bind:value={$sendEmailForm.email}
          {...$constraints.email}
        />
      </label>

      <button
        class="bg-black flex mt-4 justify-center items-center rounded-xl h-12 w-full"
      >
        <span class="text-white pr-4"> Continue </span>
        <ArrowRight class="w-4 h-4" />
      </button>
    </form>

    <div class="flex mt-3 justify-center items-center">
      <hr class="w-32" />

      <p class="mx-4 text-gray7">or with</p>
      <hr class="w-32" />
    </div>

    <button
      class="w-full h-12 mt-4 border-2 border-black rounded-xl justify-self-center"
      on:click={() => signIn("google", { callbackUrl: "/" })}
      >Sign In with Google</button
    >
  {/if}
</div>
