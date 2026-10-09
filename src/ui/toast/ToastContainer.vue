<script setup lang="ts">
import { useAppStore } from '../../stores/app'
const store = useAppStore()
</script>

<template>
  <TransitionGroup name="fade" tag="div" class="toast-container">
    <div v-for="t in store.toasts" :key="t.id" class="toast">{{ t.message }}</div>
  </TransitionGroup>
</template>
