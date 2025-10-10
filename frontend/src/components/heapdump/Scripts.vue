<script setup lang="ts">
import { ref, nextTick } from 'vue';
import Editor from './Editor.vue';
import CommonTable from '@/components/heapdump/CommonTable.vue';
import { hdt } from '@/components/heapdump/utils';
import { getIcon } from '@/components/heapdump/icon-helper';
import { prettySize } from '@/support/utils';
import { t } from '@/i18n/i18n';
import { useSelectedObject } from '@/composables/heapdump/selected-object';
import { commonMenu as menu } from '@/components/heapdump/menu';
import FileExplorer from './FileExplorer.vue';

const { selectedObjectId } = useSelectedObject();

const activeFilePath = ref<string | null>(null);
const fileContents = ref(new Map<string, string>());

const RESULT_TAB = 'Result';

const tabs = [
  { name: RESULT_TAB },
  { name: 'Console Log', key: 'stdOut' },
  { name: 'Console Error', key: 'stdErr' }
];

const showDataTable = ref(false);
const scriptResult = ref(null);
const processing = ref(false);
const activeTab = ref(RESULT_TAB);

function handleRunScript(payload: { activeFilePath: string; fileContents: Map<string, string> }) {
  activeFilePath.value = payload.activeFilePath;
  fileContents.value = payload.fileContents;
  executeScript();
}

function executeScript() {
  if (activeFilePath.value) {
    scriptResult.value = null;
    processing.value = true;
    showDataTable.value = false;
    activeTab.value = RESULT_TAB;
    nextTick(() => {
      showDataTable.value = true;
    });
  }
}

const className = {
  label: () => hdt('column.className'),
  minWidth: 250,
  content: (d) => d.label,
  icon: (d) => getIcon(d.gCRoot, d.objectType, d.objType),
  suffixMapper: (d) => d.suffix
};

const shallowHeap = {
  label: 'Shallow Heap',
  width: 130,
  align: 'right',
  sortable: true,
  property: 'shallowHeap',
  content: (d) => prettySize(d.shallowSize)
};

const retainedHeap = {
  label: 'Retained Heap',
  width: 130,
  align: 'right',
  sortable: true,
  property: 'retainedHeap',
  content: (d) => prettySize(d.retainedSize)
};

const TREE = 1;
const TABLE = 2;
const TEXT = 3;

const columnsOfTreeResult = ref([className, shallowHeap, retainedHeap]);

const tableProps = ref({
  columns: [],

  apis: [
    {
      api: 'script',
      parameters() {
        return {
          entryPath: activeFilePath.value,
          payload: Object.fromEntries(fileContents.value)
        };
      },
      respMapper(r) {
        scriptResult.value = {
          stdOut: r.stdOut,
          stdErr: r.stdErr
        };
        if (r.oqlResult.type == TEXT) {
          showDataTable.value = false;
          scriptResult.value['text'] = r.oqlResult.text;
          processing.value = false;
          return {
            data: [],
            totalSize: 0
          };
        }
        processing.value = false;
        return r.oqlResult.pv;
      },
      paged: true
    },
    {
      api: 'outbounds',
      parameters(d) {
        return {
          objectId: d.objectId
        };
      },
      paged: true
    }
  ],

  columnAdjuster(r) {
    if (r.oqlResult.type == TREE) {
      if (tableProps.value.columns === columnsOfTreeResult.value) {
        return false;
      }
      tableProps.value.hasChildren = (d) => d.hasOutbound;
      tableProps.value.columns = columnsOfTreeResult.value;
    } else if (r.oqlResult.type == TABLE) {
      tableProps.value.hasChildren = undefined;
      let columns = [];
      for (let i = 0; i < r.oqlResult.columns.length; i++) {
        const index = i;
        columns.push({
          label: r.oqlResult.columns[index],
          content: (d) => d.values[index] || 'null'
        });
      }
      tableProps.value.columns = columns;
    } else if (r.oqlResult.type == TEXT) {
      tableProps.value.hasChildren = undefined;
      tableProps.value.columns = [];
    }
    return true;
  },

  defaultSortProperty: {
    prop: 'retainedHeap',
    order: 'descending'
  },

  sortParameterConverter: (sortProperty) => {
    return {
      sortBy: sortProperty.prop,
      ascendingOrder: sortProperty.order === 'ascending'
    };
  },

  onRowClick(d) {
    if (d.hasOwnProperty('objectId')) {
      selectedObjectId.value = d.objectId;
    }
  },

  menu,

  hasMenu(d) {
    return d.hasOwnProperty('objectId');
  }
});
</script>

<template>
  <div class="script-container">
    <div style="width: 25%; height: 100%">
      <FileExplorer />
    </div>
    <el-divider direction="vertical" style="height: 100%; margin: 0" />
    <div style="display: flex; flex-direction: column; width: 75%; height: 100%">
      <Editor class="editor-pane" @run-script="handleRunScript" />
      <div class="output-pane">
        <el-tabs type="border-card" v-model="activeTab" class="output-tabs">
          <el-tab-pane
            v-for="tab in tabs"
            :key="tab.name"
            :label="tab.name"
            :name="tab.name"
            class="tab-wrapper"
          >
            <el-scrollbar v-if="tab.name === RESULT_TAB">
              <CommonTable v-bind="tableProps" v-if="showDataTable" />
              <el-table
                v-if="scriptResult?.text"
                size="small"
                :data="[scriptResult]"
                style="height: 100%"
                :header-cell-style="{
                  background: 'var(--el-fill-color-light)',
                  color: 'var(--el-text-color-primary)'
                }"
              >
                <el-table-column :label="t('common.result')">
                  <div style="white-space: pre-wrap">{{ scriptResult.text }}</div>
                </el-table-column>
              </el-table>
            </el-scrollbar>

            <template v-else>
              <div v-if="!scriptResult?.[tab.key]?.trim()" class="empty-content">
                <el-text>Nothing to display</el-text>
              </div>
              <el-scrollbar v-else>
                <el-text
                  tag="pre"
                  class="console-output"
                  :type="tab.name === 'Console Error' ? 'danger' : 'info'"
                >
                  {{ scriptResult?.[tab.key] || '' }}
                </el-text>
              </el-scrollbar>
            </template>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
  </div>
</template>

<style scoped>
.script-container {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  border: 1px solid var(--el-border-color-light);
  border-radius: var(--el-border-radius-base);
}

.editor-pane {
  height: 70%;
  position: relative;
}

.output-pane {
  height: 30%;
  min-height: 0;
}

.output-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.output-tabs :deep(.el-tabs__content) {
  padding: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.output-tabs :deep(.el-tab-pane) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.empty-content {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  color: var(--el-text-color-secondary);
}

.console-output {
  margin: 8px 10px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
