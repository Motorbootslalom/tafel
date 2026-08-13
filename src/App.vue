<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from './lib/router'
import StartView from './views/StartView.vue'
import BoardView from './views/BoardView.vue'
import AdminView from './views/AdminView.vue'
import StegView from './views/StegView.vue'
import ListView from './views/ListView.vue'
import PairView from './views/PairView.vue'

const route = useRoute()

const component = computed(() => {
  switch (route.value.view) {
    case 'tafel':
      return BoardView
    case 'admin':
      return AdminView
    case 'steg':
      return StegView
    case 'liste':
      return ListView
    case 'pair':
      return PairView
    default:
      return StartView
  }
})
</script>

<template>
  <component :is="component" :params="route.params" />
</template>
