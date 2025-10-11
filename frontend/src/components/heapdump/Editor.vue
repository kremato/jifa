<script setup lang="ts">
import { ref, onBeforeUnmount, computed } from 'vue';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/min/vs/editor/editor.main.css';
import { useFileSystem } from '@/composables/heapdump/scripts-file-system';
import { Document, ArrowRight, CaretRight } from '@element-plus/icons-vue';

const emit = defineEmits(['run-script']);

let editor: monaco.editor.IStandaloneCodeEditor | null = null;
const monacoEl = ref<HTMLElement | null>(null);
const { activeFilePath } = useFileSystem();

watch(activeFilePath, async (newPath, oldPath) => {
  if (newPath && newPath !== oldPath) {
    openFile(newPath);
  }
});

onBeforeUnmount(() => {
  disposeEditor();
});

function disposeEditor() {
  editor?.dispose();
  editor = null;
}

async function createEditor() {
  if (!monacoEl.value || editor) return;

  editor = monaco.editor.create(monacoEl.value, {
    automaticLayout: true,
    minimap: {
      enabled: false
    },
    lineNumbers: 'on',
    lineNumbersMinChars: 3,
    glyphMargin: false,
    folding: true,
    lineDecorationsWidth: 0,
    renderLineHighlight: 'line'
  });
}

async function openFile(path: string) {
  // Ensure editor exists and is connected to DOM
  if (!editor || !editor.getDomNode()) {
    disposeEditor();
    await createEditor();
  }

  const model = monaco.editor.getModel(monaco.Uri.file(path));
  if (model && editor) editor.setModel(model);
}

const activeFilePathAsList = computed(() => {
  let path = activeFilePath.value;
  if (path?.startsWith('/')) {
    path = path.slice(1);
  }
  return path ? path.split('/') : [];
});

function runScript() {
  if (!activeFilePath.value) return;

  // Get all Monaco models and their contents
  const allModels = monaco.editor.getModels();
  const fileContents = new Map<string, string>();

  allModels.forEach((model) => {
    const filePath = model.uri.path.startsWith('/') ? model.uri.path.slice(1) : model.uri.path;
    fileContents.set(filePath, model.getValue());
  });

  let path = activeFilePath.value;
  path = path.startsWith('/') ? path.slice(1) : path;

  emit('run-script', { activeFilePath: path, fileContents });
}
</script>

<template>
  <div v-if="!activeFilePath" class="welcome-screen">
    <div class="welcome-content">
      <el-text tag="b" size="large">Welcome to the Script Editor</el-text>
      <el-text tag="p" size="large">
        Please select a file from the file explorer to start editing.
      </el-text>
    </div>
  </div>

  <!-- Make sure editor always has a DOM node to attach to by using v-show -->
  <div v-show="activeFilePath" class="editor-content">
    <div class="file-header" style="margin-right: 1rem">
      <div class="file-header">
        <el-icon class="el-icon--left">
          <Document />
        </el-icon>
        <el-breadcrumb :separator-icon="ArrowRight">
          <el-breadcrumb-item v-for="(segment, index) in activeFilePathAsList" :key="index">
            {{ segment }}
          </el-breadcrumb-item>
        </el-breadcrumb>
      </div>
      <el-button
        type="text"
        plain
        style="padding-top: 0rem; padding-bottom: 0rem; padding-left: 0rem; padding-right: 0.5rem"
        @click="runScript"
      >
        <el-icon size="24">
          <CaretRight />
        </el-icon>
        Run
      </el-button>
    </div>
    <el-divider style="margin: 0" />
    <div class="monaco-container" ref="monacoEl"></div>
  </div>
</template>

<style scoped>
.editor-container {
  height: 100%;
  width: 100%;
}

.welcome-screen {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
}

.welcome-content {
  text-align: center;
  max-width: 500px;
  padding: 2rem;
}

.welcome-title {
  font-size: 1.5rem;
  font-weight: 500;
  margin-bottom: 1rem;
  color: var(--el-text-color-primary);
}

.welcome-subtitle {
  font-size: 1rem;
  line-height: 1.6;
  color: var(--el-text-color-regular);
  margin: 0;
}

.editor-content {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.file-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 2.5rem;
  margin-left: 1rem;
}

.monaco-container {
  flex: 1;
  width: 100%;
}
</style>
