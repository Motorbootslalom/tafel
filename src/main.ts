import { createApp } from 'vue'
import App from './App.vue'
import { createStore, storeKey } from './state/store'
import { vFit, vFitBlock } from './lib/fit'
import './styles.css'

createApp(App)
  .directive('fit', vFit)
  .directive('fit-block', vFitBlock)
  .provide(storeKey, createStore())
  .mount('#root')
