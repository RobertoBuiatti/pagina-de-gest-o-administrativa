<template>
  <button v-bind="$attrs" :class="[$style.btn, $attrs.class]" @click="$emit('click', $event)">
    <slot />
  </button>
</template>

<script>
export default {
  name: 'AppButton',
  emits: ['click']
}
</script>

<style module src="./Button.module.css"></style>
