<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/min/vs/editor/editor.main.css';

const emit = defineEmits(['content-changed']);

const monacoEl = ref<HTMLElement | null>(null);
let editor: monaco.editor.IStandaloneCodeEditor | null = null;

onMounted(() => {
  if (!monacoEl.value) return;

  editor = monaco.editor.create(monacoEl.value, {
    value: '// write your script here\n',
    language: 'javascript',
    automaticLayout: true,
    minimap: {
      enabled: false
    }
  });

  editor.onDidChangeModelContent(() => {
    const currentContent = editor?.getValue();
    emit('content-changed', currentContent);
  });
});

onBeforeUnmount(() => {
  editor?.dispose();
  editor = null;
});
</script>

<template>
  <div style="height: 100%; width: 100%" ref="monacoEl"></div>
</template>
