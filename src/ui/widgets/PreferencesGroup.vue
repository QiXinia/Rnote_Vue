<script setup lang="ts">
// AdwPreferencesGroup equivalent: a titled, rounded card containing rows with
// separators between them.
withDefaults(
  defineProps<{ title?: string; description?: string }>(),
  {}
)
</script>

<template>
  <div class="pref-group">
    <div v-if="title || description" class="pref-group-head">
      <div v-if="title" class="pref-group-title">{{ title }}</div>
      <div v-if="description" class="pref-group-desc">{{ description }}</div>
    </div>
    <div class="pref-group-body"><slot /></div>
  </div>
</template>

<style scoped>
.pref-group {
  margin-bottom: 16px;
}
.pref-group-head {
  padding: 0 6px 7px;
}
.pref-group-title {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--fg-muted);
  text-transform: none;
}
.pref-group-desc {
  font-size: 11.5px;
  color: var(--fg-faint);
  margin-top: 2px;
}
.pref-group-body {
  background: color-mix(in srgb, var(--fg) 4%, var(--card-bg));
  border-radius: 12px;
  overflow: hidden;
}
.pref-group-body > *:not(:last-child) {
  border-bottom: 1px solid color-mix(in srgb, var(--fg) 9%, transparent);
}
</style>
