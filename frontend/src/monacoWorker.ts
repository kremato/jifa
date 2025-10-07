import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// @ts-ignore
self.MonacoEnvironment = {
  getWorker(_: any, label: string) {
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker();
    }
    return new editorWorker();
  }
};

monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);

monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
  checkJs: true,
  allowJs: true,
  target: monaco.languages.typescript.ScriptTarget.ES2020,
  module: monaco.languages.typescript.ModuleKind.ES2015
});
monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true);
