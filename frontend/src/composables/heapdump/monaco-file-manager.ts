import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

export function useMonacoFileManager() {
  function createMonacoModel(path: string, content: string = '') {
    const uri = monaco.Uri.file(path);
    let model = monaco.editor.getModel(uri);
    if (!model) {
      monaco.editor.createModel(content, 'javascript', uri);
    } else {
      return;
    }
  }

  function deleteMonacoFile(path: string) {
    const model = monaco.editor.getModel(monaco.Uri.file(path));
    if (model) {
      model.dispose();
    }
  }

  function renameMonacoFile(currentPath: string, newPath: string) {
    const model = monaco.editor.getModel(monaco.Uri.file(currentPath));
    if (model) {
      const content = model.getValue();
      deleteMonacoFile(currentPath);
      createMonacoModel(newPath, content);
    }
  }

  function getAllMonacoFiles(): Map<string, string> {
    const fileContents = new Map<string, string>();
    const models = monaco.editor.getModels();

    models.forEach((model) => {
      const filePath = model.uri.path.startsWith('/') ? model.uri.path.slice(1) : model.uri.path;
      const content = model.getValue();
      fileContents.set(filePath, content);
    });

    return fileContents;
  }

  function parseFunctionExports(content: string): string[] {
    const exportRegex =
      /export\s+(?:function\s+(\w+)|const\s+(\w+)\s*=|let\s+(\w+)\s*=|var\s+(\w+)\s*=)/g;
    const exports: string[] = [];
    let match;

    while ((match = exportRegex.exec(content)) !== null) {
      const exportName = match[1] || match[2] || match[3] || match[4];
      if (exportName) exports.push(exportName);
    }

    return exports;
  }

  function getExports(path: string): string[] | null {
    const model = monaco.editor.getModel(monaco.Uri.file(path));
    if (!model) return null;
    const content = model.getValue();
    return parseFunctionExports(content);
  }

  return {
    createMonacoModel,
    deleteMonacoFile,
    renameMonacoFile,
    getAllMonacoFiles,
    getExports
  };
}
