<script lang="ts" setup>
import { ref, nextTick, markRaw, computed } from 'vue';
import type { DragEvents } from 'element-plus/es/components/tree/src/model/useDragNode';
import type {
  AllowDropType,
  NodeDropType,
  RenderContentContext
} from 'element-plus/es/components/tree/src/tree.type.mjs';
import { Document, Download, Folder, Upload } from '@element-plus/icons-vue';
import CommonContextMenu from '@/components/common/CommonContextMenu.vue';
import { folderMenu, explorerMenu, fileMenu } from '@/components/heapdump/menu';
import { listen, EventType } from '@/components/heapdump/event-bus';
import { ElMessageBox, ElMessage, type TreeInstance } from 'element-plus';
import { Delete } from '@element-plus/icons-vue';
import {
  useFileSystem,
  type Node,
  type NodeType
} from '@/composables/heapdump/scripts-file-system';

const contextmenu = ref();
const currentMenu = ref(folderMenu);
const editedNodeId = ref<string | null>(null);
const editedNodeLabel = ref('');
const editedNodeType = ref<NodeType | null>(null);
const renameInputRef = ref();
const draggedNode = ref<Node | null>(null);
const virtualNode = ref<Node | null>(null);
const dirInput = ref<HTMLInputElement | null>(null);
const treeRef = ref<TreeInstance>();

type TreeNode = RenderContentContext['node'];

const {
  root,
  createNode: addNode,
  sortedNodes,
  deleteNode,
  moveNode,
  renameNode,
  isDuplicateLabel,
  setActiveFile,
  generateUniqueId,
  importFiles,
  isMjsFile,
  validateLabel,
  forbiddenChars
} = useFileSystem();

const ROOT_ID = root.value.id;

// Function to trigger folder picker
const pickFolder = () => dirInput.value?.click();

const onDirPicked = async (e: Event) => {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files || []);

  const mjsFiles = files.filter((file) => file.name.endsWith('.mjs'));

  if (mjsFiles.length === 0) {
    ElMessage.warning('No .mjs files found in the selected folder');
    return;
  }

  try {
    await importFiles(mjsFiles);
    ElMessage.success(`Imported ${mjsFiles.length} .mjs files`);
  } catch (error) {
    ElMessage.error('Failed to import folder');
  } finally {
    // Reset input so picking the same folder again fires change
    input.value = '';
  }
};

const handleDragStart = (node: TreeNode, _: DragEvents) => {
  draggedNode.value = node.data as Node;
};

const handleDragEnd = (
  draggingNode: TreeNode,
  dropNode: TreeNode,
  dropType: NodeDropType,
  ev: DragEvents
) => {
  draggedNode.value = null;
};

const handleDrop = (
  draggingNode: TreeNode,
  dropNode: TreeNode,
  dropType: NodeDropType,
  ev: DragEvents
) => {
  const draggedNode = draggingNode.data as Node;
  const parentFolder = dropNode.data as Node;

  moveNode(draggedNode.id, parentFolder.id);
};

const showFileExistsError = (fileName: string) => {
  ElMessage.error(`A file named "${fileName}" already exists in the target folder`);
};

const allowDrop = (draggingNode: TreeNode, dropNode: TreeNode, type: AllowDropType) => {
  // Can only drop into folders
  if (dropNode.data.type !== 'folder') {
    return false;
  }

  // Only allow dropping 'inner' (directly on folder item)
  if (type !== 'inner') {
    return false;
  }

  // Don't allow dropping a node onto itself
  if (draggingNode.data.id === dropNode.data.id) {
    return false;
  }

  // Check if folder already contains a file with the same name
  const targetFolder = dropNode.data as Node;
  const draggedNode = draggingNode.data as Node;

  return !isDuplicateLabel(targetFolder.children, draggedNode.label);
};

const handleTreeDragOver = (event: DragEvent) => {
  if (draggedNode.value) {
    event.preventDefault();
  }
};

const handleTreeDrop = (event: DragEvent) => {
  event.preventDefault();

  if (!draggedNode.value) return;

  if (isDuplicateLabel(displayNodes.value, draggedNode.value.label)) {
    showFileExistsError(draggedNode.value.label);
    return;
  }

  moveNode(draggedNode.value.id, ROOT_ID);
  draggedNode.value = null;
};

const handleNodeContextMenu = (event: MouseEvent, data: Node) => {
  if (data.type === 'folder') {
    currentMenu.value = folderMenu;
  } else {
    currentMenu.value = fileMenu;
  }
  contextmenu.value.show(event, data);
};

const handleTreeContextMenu = (event: MouseEvent) => {
  currentMenu.value = explorerMenu;
  contextmenu.value.show(event, root.value);
};

function resetRename() {
  editedNodeId.value = null;
  editedNodeLabel.value = '';
  editedNodeType.value = null;
  virtualNode.value = null;
}

function focusRenameInput() {
  if (renameInputRef.value) {
    renameInputRef.value.focus();
    renameInputRef.value.select();
  }
}

const handleNodeClick = (data: Node) => {
  if (data.type === 'file' && virtualNode.value?.id !== data.id) {
    setActiveFile(data.id);
  }
};

function saveRename() {
  const nodeId = editedNodeId.value;
  const newLabel = editedNodeLabel.value.trim();

  if (!nodeId) {
    resetRename();
    return;
  }

  // If it's a virtual node and name is empty, just cancel
  if (virtualNode.value && !newLabel) {
    resetRename();
    return;
  }

  // If name is empty for existing item, keep original name
  if (!newLabel && !virtualNode.value) {
    resetRename();
    return;
  }

  if (!validateLabel(newLabel)) {
    const formattedChars = forbiddenChars.map((char) => `"${char}"`).join(', ');
    ElMessage.error(`The following characters are not allowed: ${formattedChars}`);
    nextTick(() => focusRenameInput());
    return;
  }

  if (editedNodeType.value === 'file' && !isMjsFile(newLabel)) {
    ElMessage.error('File names must end with ".mjs" extension');
    nextTick(() => focusRenameInput());
    return;
  }

  const parent = (treeRef.value?.getNode(nodeId)?.data as Node).parent;

  if (!parent) {
    resetRename();
    return;
  }

  if (isDuplicateLabel(parent.children, newLabel)) {
    showFileExistsError(newLabel);
    nextTick(() => focusRenameInput());
    return;
  }

  if (virtualNode.value) {
    // Create new node
    addNode(getParentIdForVirtualNode(), newLabel, virtualNode.value.type);
  } else {
    renameNode(nodeId, newLabel);
  }

  resetRename();
}

function handleRenameKeydown(event: Event | KeyboardEvent) {
  const keyboardEvent = event as KeyboardEvent;
  if (keyboardEvent.key === 'Enter') {
    keyboardEvent.preventDefault();
    saveRename();
  } else if (keyboardEvent.key === 'Escape') {
    keyboardEvent.preventDefault();
    if (editedNodeId.value) {
      // For existing and virtual nodes, just cancel rename
      resetRename();
    }
  }
}

listen(EventType.FILE_RENAME, async (payload: Node) => {
  editedNodeId.value = payload.id;
  editedNodeLabel.value = payload.label;

  await nextTick();
  focusRenameInput();
});

listen(EventType.FILE_DELETE, async (payload: Node) => {
  try {
    await ElMessageBox.confirm(
      `Are you sure you want to delete "${payload.label}"?`,
      `Delete ${payload.type}`,
      {
        confirmButtonText: 'Delete',
        cancelButtonText: 'Cancel',
        type: 'warning',
        icon: markRaw(Delete)
      }
    );
    deleteNode(payload.id);
  } catch (_) {}
});

async function createNode(parent: Node, type: NodeType) {
  const nodeId = generateUniqueId();
  const label = type === 'file' ? 'New File' : 'New Folder';

  virtualNode.value = {
    id: nodeId,
    label: label,
    type: type,
    parent: parent,
    children: []
  };

  editedNodeId.value = nodeId;
  editedNodeLabel.value = label;
  editedNodeType.value = type;

  // Wait for Vue to update the DOM before focusing
  await nextTick();
  focusRenameInput();
}

// Computed property that merges virtual node with real nodes
const displayNodes = computed(() => {
  if (!virtualNode.value) {
    return sortedNodes.value;
  }

  // Find where to insert the virtual node
  const parentId = getParentIdForVirtualNode();

  const insertVirtualNode = (nodes: Node[]): Node[] => {
    return nodes.map((node) => {
      if (node.id === parentId) {
        return {
          ...node,
          children: [virtualNode.value!, ...node.children]
        };
      } else if (node.children.length > 0) {
        return {
          ...node,
          children: insertVirtualNode(node.children)
        };
      }
      return node;
    });
  };

  if (parentId === ROOT_ID) {
    return [virtualNode.value, ...sortedNodes.value];
  } else {
    return insertVirtualNode(sortedNodes.value);
  }
});

let virtualNodeParentId = ROOT_ID;

function getParentIdForVirtualNode(): string {
  return virtualNodeParentId;
}

listen(EventType.FILE_CREATE, async (payload: Node) => {
  virtualNodeParentId = payload.id;
  await createNode(payload, 'file');
});

listen(EventType.FOLDER_CREATE, async (payload: Node) => {
  virtualNodeParentId = payload.id;
  await createNode(payload, 'folder');
});
</script>

<template>
  <div
    style="
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-inline: 1rem;
      height: 2.5rem;
    "
  >
    <el-text style="font-weight: 600">File Explorer</el-text>
    <div style="display: flex; justify-content: space-between; gap: 10px">
      <!-- Use button that triggers hidden input -->
      <el-button type="primary" size="small" plain @click="pickFolder">
        <el-icon size="16">
          <Upload />
        </el-icon>
      </el-button>

      <!-- Hidden input for folder selection -->
      <input
        ref="dirInput"
        type="file"
        webkitdirectory
        multiple
        style="display: none"
        @change="onDirPicked"
      />

      <el-button type="primary" size="small" plain>
        <el-icon size="16">
          <Download />
        </el-icon>
      </el-button>
    </div>
  </div>
  <el-divider style="margin: 0" />
  <CommonContextMenu :menu="currentMenu" ref="contextmenu" />
  <div class="tree-container" @drop="handleTreeDrop" @dragover="handleTreeDragOver">
    <el-tree
      ref="treeRef"
      style="height: 100%"
      :allow-drop="allowDrop"
      :allow-drag="(_: TreeNode) => true"
      :data="displayNodes"
      draggable
      default-expand-all
      node-key="id"
      @contextmenu="handleTreeContextMenu"
      @node-click="handleNodeClick"
      @node-contextmenu="handleNodeContextMenu"
      @node-drag-start="handleDragStart"
      @node-drag-end="handleDragEnd"
      @node-drop="handleDrop"
    >
      <template #default="{ node, data }">
        <div class="custom-tree-node">
          <el-icon class="el-icon--left">
            <Document v-if="data.type === 'file'" />
            <Folder v-else="!node.expanded" />
          </el-icon>

          <el-input
            v-if="editedNodeId === data.id"
            ref="renameInputRef"
            v-model="editedNodeLabel"
            size="small"
            @blur="saveRename"
            @keydown="handleRenameKeydown"
          />

          <span v-else>{{ node.label }}</span>
        </div>
      </template>
      <template #empty>
        <div
          style="
            display: flex;
            flex-direction: column;
            height: 100%;
            justify-content: center;
            align-items: center;
          "
        >
          <div style="text-align: center; padding: 2rem; color: var(--el-text-color-secondary)">
            <el-icon size="48" style="margin-bottom: 1rem">
              <Folder />
            </el-icon>
            <div>No files or folders</div>
            <div style="font-size: 0.9em; margin-top: 0.5rem">Right-click to create new files</div>
          </div>
        </div>
      </template>
    </el-tree>
  </div>
</template>

<style scoped>
.tree-container {
  height: 100%;
}

.custom-tree-node {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
}
</style>
