<script>
  export let title = "star";
  export let filled = false;
  export let starId;
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width="16"
  height="15"
  viewBox="0 0 51 48"
  class="star"
  on:mouseover
  on:mouseleave
  on:click
  data-starid={starId}
>
  <title>{title}</title>
  <path
    class:filled
    data-starid={starId}
    class="starPath"
    d="m25,1 6,17h18l-14,11 5,17-15-10-15,10 5-17-14-11h18z"
  />
</svg>

<style>
  .star {
    margin-right: 4px;
  }
  .starPath {
    fill: none;
    stroke: rgb(69, 49, 0);
  }
  .filled {
    fill: rgb(245, 175, 0);
  }
</style>
