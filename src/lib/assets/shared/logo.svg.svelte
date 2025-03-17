<script lang="ts">
  // export svelte class to be used in other components
  let className = "";
  export { className as class };
  export let color: "black" | "white" = "black";
</script>

<div class={`overflow-hidden relative ${className}`}>
  <img
    src="https://logistics-bucket.nyc3.cdn.digitaloceanspaces.com/Behulum-Logo.png"
    alt="Behulum Logo"
    class="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
  />
</div>
