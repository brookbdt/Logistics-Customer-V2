<script lang="ts">
  import { browser } from "$app/environment";
  import Star from "$lib/assets/shared/star.svelte";

  // User rating states
  export let rating: any = null;
  let hoverRating: any = null;

  // form interaction states
  let collectFeedback = false;
  let feedbackCompleted = false;

  // "$:" triggers when something in the line changes
  // When these variables reach true/false, they trigger these functions
  $: if (browser) {
    collectFeedback && addWatchListeners();
    !collectFeedback && feedbackFormClosed();
    function addWatchListeners() {
      document.addEventListener("keydown", userDismissFeedback);
    }
    function feedbackFormClosed() {
      feedbackCompleted = false;
      removeWatchListeners();
    }
    function removeWatchListeners() {
      document.removeEventListener("keydown", userDismissFeedback);
    }

    function userDismissFeedback(event: any) {
      switch (event.key) {
        case "Escape":
          collectFeedback = false;
          break;
        default:
          return;
      }
    }
  }

  // using curried function to initialize hover with id
  const handleHover = (id: any) => () => {
    hoverRating = id;
  };
  const handleRate = (id: any) => (event: any) => {
    if (
      collectFeedback &&
      rating &&
      rating.toString() === event.srcElement.dataset.starid
    ) {
      collectFeedback = false;
      return;
    }
    rating = id;
    collectFeedback = true;
  };

  let stars = [
    { id: 1, title: "One Star" },
    { id: 2, title: "Two Stars" },
    { id: 3, title: "Three Stars" },
    { id: 4, title: "Four Stars" },
    { id: 5, title: "Five Stars" },
  ];
</script>

<div class="feedback">
  <span
    id="feedbackContiner"
    class="feedbackContainer"
    class:feedbackContainerDisabled={feedbackCompleted}
  >
    <span class="starContainer">
      <div class="flex">
        {#each stars as star (star.id)}
          <Star
            filled={hoverRating ? hoverRating >= star.id : rating >= star.id}
            starId={star.id}
            on:mouseover={handleHover(star.id)}
            on:mouseleave={() => (hoverRating = null)}
            on:click={handleRate(star.id)}
          />
        {/each}
      </div>
      <!-- <p>
        You've selected {rating ? rating : "no"} star{rating === 1 ? "" : "s"},
      </p> -->
    </span>
  </span>
</div>

<style>
  .feedback {
    position: relative;
  }

  .feedbackContainerDisabled {
    pointer-events: none;
  }
  :global(button) {
    cursor: pointer;
  }
</style>
