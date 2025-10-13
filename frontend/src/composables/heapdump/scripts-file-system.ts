import { strToU8, zipSync } from 'fflate';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { computed, ref } from 'vue';
// @ts-ignore
import { v4 as uuidv4 } from 'uuid';
import { useMonacoFileManager } from './monaco-file-manager';

export type NodeType = 'file' | 'folder';

export interface Node {
  id: string;
  label: string;
  type: NodeType;
  parent?: Node;
  children: Node[];
}

const ROOT_ID = 'root';

const root = shallowRef<Node>({
  id: ROOT_ID,
  label: '/',
  type: 'folder',
  children: []
});

const nodeMap = new Map<string, Node>();
nodeMap.set(root.value.id, root.value);

const activeFileId = ref<string | null>(null);
const activeFilePath = ref<string | null>(null);

export function useFileSystem() {
  const { createMonacoModel, deleteMonacoFile, renameMonacoFile } = useMonacoFileManager();

  // ============================
  // COMPUTED PROPERTIES
  // ============================

  const clonedRoot = computed<Node>(() => structuredClone(root.value));

  // ============================
  // NODE LOOKUP & VALIDATION
  // ============================

  function findNodeById(nodeId: string): Node | undefined {
    return nodeMap.get(nodeId);
  }

  function isDuplicateLabel(nodes: Node[], nodeLabel: string): boolean {
    return nodes.some((node) => node.label.toLowerCase() === nodeLabel.toLowerCase());
  }

  function isMjsFile(label: string): boolean {
    return label.endsWith('.mjs');
  }

  const forbiddenChars = ['/'];

  function validateLabel(label: string): boolean {
    return label.trim() !== '' && !forbiddenChars.some((char) => label.includes(char));
  }

  function validateLabelByNodeType(label: string, type: NodeType): boolean {
    if (type === 'file' && !isMjsFile(label)) return false;
    return validateLabel(label);
  }

  // ============================
  // NODE & PATH UTILITIES
  // ============================

  function sortChildren(parent: Node) {
    parent.children.sort((a, b) => {
      // Place folders before files
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      // Then sort alphabetically by label
      return a.label.localeCompare(b.label);
    });
  }

  function generateUniqueId(): string {
    return uuidv4();
  }

  /**
   * Constructs absolute path for a given node.
   *
   * @param nodeId - Node ID to get the path for
   * @returns The absolute path string starting with "/" or null if the node doesn't exist
   */
  function getNodePath(nodeId: string): string | null {
    let node = findNodeById(nodeId);
    if (!node) return null;

    if (node.id === ROOT_ID) return '/';

    const pathSegments: string[] = [];

    while (node && node.id !== ROOT_ID) {
      pathSegments.unshift(node.label);
      node = node.parent;
    }

    return '/' + pathSegments.join('/');
  }

  /**
   * Collects all nodes and their paths within a given node's subtree, including the starting node.
   */
  function getAffectedNodes(
    nodeId: string,
    type: NodeType | undefined = undefined
  ): { id: string; path: string }[] {
    const affectedNodes: { id: string; path: string }[] = [];
    const collectNodes = (node: Node) => {
      if (!type || node.type === type) {
        const path = getNodePath(node.id);
        if (path) affectedNodes.push({ id: node.id, path });
      }
      for (const child of node.children) {
        collectNodes(child);
      }
    };
    const node = findNodeById(nodeId);
    if (node) collectNodes(node);
    return affectedNodes;
  }

  function getAffectedFiles(nodeId: string) {
    return getAffectedNodes(nodeId, 'file');
  }

  // ============================
  // ACTIVE FILE MANAGEMENT
  // ============================

  function setActiveFile(nodeId: string) {
    const node = findNodeById(nodeId);
    if (!node || node.type !== 'file') return;
    activeFileId.value = nodeId;
    activeFilePath.value = getNodePath(nodeId);
  }

  function clearActiveFile() {
    activeFileId.value = null;
    activeFilePath.value = null;
  }

  // ============================
  // NODE OPERATIONS
  // ============================

  function createNode(
    parentId: string,
    label: string,
    type: NodeType,
    content = ''
  ): string | null {
    // TODO: do I need to return the ID?
    const parent = findNodeById(parentId);
    if (!parent) return null;
    if (!validateLabelByNodeType(label, type)) return null;
    if (parent.type !== 'folder' || isDuplicateLabel(parent.children, label)) return null;

    const node: Node = {
      id: generateUniqueId(),
      label,
      type,
      parent,
      children: []
    };
    parent.children.push(node);
    sortChildren(parent);
    nodeMap.set(node.id, node);
    if (node.type === 'file') {
      const path = getNodePath(node.id);
      if (path) {
        createMonacoModel(path, content || `// File: ${node.label}\n`);
      }
    }
    setActiveFile(node.id);
    triggerRef(root);
    return node.id;
  }

  function deleteNode(nodeId: string) {
    if (nodeId === ROOT_ID) return;
    const parent = nodeMap.get(nodeId)?.parent;
    if (!parent) return;
    const nodeIdx = parent.children.findIndex((child) => child.id === nodeId);
    if (nodeIdx === -1) return;
    // Get affected nodes before deletion
    const affectedNodes = getAffectedNodes(nodeId);
    // Delete node
    parent.children.splice(nodeIdx, 1);
    affectedNodes.forEach((node) => {
      nodeMap.delete(node.id);
      if (node.id === activeFileId.value) clearActiveFile();
      // Delete Monaco models for affected files
      deleteMonacoFile(node.path);
    });
    if (nodeId === activeFileId.value) clearActiveFile();
    triggerRef(root);
  }

  function renameNode(nodeId: string, newLabel: string) {
    if (nodeId === ROOT_ID) return;
    const node = findNodeById(nodeId);
    if (!node) return;
    // Get affected files before rename
    const affectedFiles = getAffectedFiles(nodeId);
    // Rename node
    node.label = newLabel;
    if (node.parent) {
      sortChildren(node.parent);
    }
    // Update Monaco models for affected files
    affectedFiles.forEach((file) => {
      const newPath = getNodePath(file.id);
      if (newPath) renameMonacoFile(file.path, newPath);
    });
    setActiveFile(nodeId);
    triggerRef(root);
    return;
  }

  function moveNode(nodeId: string, targetNodeId: string) {
    if (nodeId === targetNodeId || nodeId === ROOT_ID) return;

    const nodeToMove = findNodeById(nodeId);
    if (!nodeToMove) return;

    const currentParent = nodeToMove.parent;
    if (!currentParent) return;

    const newParent = findNodeById(targetNodeId);
    if (
      !newParent ||
      newParent.type !== 'folder' ||
      isDuplicateLabel(newParent.children, nodeToMove.label)
    )
      return;

    // Get affected files before node removal from current parent
    const affectedFiles = getAffectedFiles(nodeId);

    // Remove node from current parent
    const currentIndex = currentParent.children.findIndex((child) => child.id === nodeId);
    if (currentIndex === -1) {
      // Node not found in current parent children
      return;
    }

    // Perform the move
    const [movedNode] = currentParent.children.splice(currentIndex, 1);
    newParent.children.push(movedNode);
    sortChildren(newParent);
    movedNode.parent = newParent;

    // Update Monaco models for affected files
    affectedFiles.forEach((file) => {
      const newPath = getNodePath(file.id);
      if (!newPath) return;
      renameMonacoFile(file.path, newPath);
    });

    if (nodeId === activeFileId.value) {
      clearActiveFile();
    }

    setActiveFile(nodeId);
    triggerRef(root);
  }

  // ============================
  // BULK OPERATIONS
  // ============================

  /**
   * Replaces current file system with imported files
   */
  async function importFiles(files: File[]) {
    clearActiveFile();

    // Get all current file paths before replacement
    const filesToDelete = getAffectedFiles(ROOT_ID);

    // Delete all old Monaco models
    filesToDelete.forEach((file) => {
      deleteMonacoFile(file.path);
    });

    // Clear the node map
    nodeMap.clear();
    nodeMap.set(root.value.id, root.value);

    // Clear current file system
    root.value.children = [];

    const folderByPath = new Map<string, Node>();
    folderByPath.set('', root.value);

    const ensureFolder = (segments: string[]): Node => {
      let path = '';
      let parent = root.value;

      for (const seg of segments) {
        if (!seg) continue;
        path = path ? `${path}/${seg}` : seg;
        let folder = folderByPath.get(path);
        if (!folder) {
          folder = {
            id: generateUniqueId(),
            label: seg,
            type: 'folder',
            parent,
            children: []
          };
          parent.children.push(folder);
          folderByPath.set(path, folder);
          nodeMap.set(folder.id, folder);
        }
        parent = folder;
      }
      return parent;
    };

    for (const f of files) {
      const path = f.webkitRelativePath;
      const parts = path.split('/');
      if (parts.length > 1) parts.shift(); // Remove top-level folder
      const fileName = parts.pop()!;
      const parent = ensureFolder(parts);
      const content = await f.text();

      const fileNode: Node = {
        id: generateUniqueId(),
        label: fileName,
        type: 'file',
        parent,
        children: []
      };
      parent.children.push(fileNode);
      nodeMap.set(fileNode.id, fileNode);
      createMonacoModel('/' + [...parts, fileName].join('/'), content);
    }

    triggerRef(root);
  }

  async function exportAsZip(): Promise<Blob> {
    const files = monaco.editor.getModels().reduce(
      (record, model) => {
        let path = model.uri.path;
        if (path.startsWith('/')) path = path.slice(1);
        record[path] = strToU8(model.getValue());
        return record;
      },
      {} as Record<string, Uint8Array>
    );
    return new Blob([new Uint8Array(zipSync(files))]);
  }

  return {
    // state
    root: clonedRoot,
    activeFileId: readonly(activeFileId),
    activeFilePath: readonly(activeFilePath),
    // utils
    isDuplicateLabel,
    generateUniqueId,
    validateLabel,
    isMjsFile,
    forbiddenChars: [...forbiddenChars],
    getNodePath,
    // node operations
    createNode,
    deleteNode,
    renameNode,
    moveNode,
    // active file operations
    setActiveFile,
    // bulk operations
    importFiles,
    exportAsZip
  };
}
