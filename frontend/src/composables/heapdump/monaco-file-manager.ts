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

  return { createMonacoModel, deleteMonacoFile, renameMonacoFile };
}
