<script setup lang="ts">
import { ref } from 'vue';
import Editor from './Editor.vue';
import CommonTable from '@/components/heapdump/CommonTable.vue';
import { hdt } from '@/components/heapdump/utils';
import { getIcon } from '@/components/heapdump/icon-helper';
import { prettySize } from '@/support/utils';
import { t } from '@/i18n/i18n';
import { useSelectedObject } from '@/composables/heapdump/selected-object';
import { commonMenu as menu } from '@/components/heapdump/menu';

const { selectedObjectId } = useSelectedObject();

const input = ref(null);
const script = ref('');
const last = ref('');

const showDataTable = ref(false);
const textResult = ref(null);
const processing = ref(false);

function handleEditorContentChange(newScript: string) {
  script.value = newScript;
}

function executeScript() {
  if (script.value) {
    let s = script.value.trim();
    if (s) {
      last.value = s;
      textResult.value = null;
      processing.value = true;
      showDataTable.value = false;
      nextTick(() => {
        showDataTable.value = true;
      });
    }
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
const columnsOfTextResult = ref([]);

const tableProps = ref({
  columns: [],

  apis: [
    {
      api: 'script',
      parameters() {
        return {
          scriptTextInJS: script.value
        };
      },
      respMapper(r) {
        if (r.type == TEXT) {
          showDataTable.value = false;
          textResult.value = [{ text: r.text }];
          processing.value = false;
          input.value.focus();
          return {
            data: [],
            totalSize: 0
          };
        }
        pushHistory(script.value.trim());
        processing.value = false;
        return r.pv;
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
    if (r.type == TREE) {
      if (tableProps.value.columns === columnsOfTreeResult.value) {
        return false;
      }
      tableProps.value.hasChildren = (d) => d.hasOutbound;
      tableProps.value.columns = columnsOfTreeResult.value;
    } else if (r.type == TABLE) {
      tableProps.value.hasChildren = undefined;
      let columns = [];
      for (let i = 0; i < r.columns.length; i++) {
        const index = i;
        columns.push({
          label: r.columns[index],
          content: (d) => d.values[index] || 'null'
        });
      }
      tableProps.value.columns = columns;
    } else if (r.type == TEXT) {
      tableProps.value.hasChildren = undefined;
      tableProps.value.columns = columnsOfTextResult.value;
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

const scriptHistory = ref([]);

function pushHistory(s) {
  let history = scriptHistory;
  s = s.trim();
  for (let i = 0; i < history.value.length; i++) {
    if (history.value[i].value === s) {
      return;
    }
  }
  history.value.unshift({ value: s });
  if (history.value.length > 8) {
    history.value.pop();
  }
}
</script>

<template>
  <div class="script-container">
    <div class="editor-pane">
      <Editor @content-changed="handleEditorContentChange" />
      <el-button @click="executeScript" class="run-button" type="primary">Run Script</el-button>
    </div>
    <div class="output-pane">
      <CommonTable v-bind="tableProps" v-if="showDataTable" />

      <el-table
        size="small"
        :data="textResult"
        v-if="textResult"
        style="height: 100%"
        :header-cell-style="{
          background: 'var(--el-fill-color-light)',
          color: 'var(--el-text-color-primary)'
        }"
      >
        <el-table-column :label="t('common.result')">
          <div style="white-space: pre-wrap">
            {{ textResult[0].text }}
          </div>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<style scoped>
.script-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  box-shadow: var(--el-border-color-light) 0px 0px 10px;
}

.editor-pane {
  height: 70%;
  position: relative;
}

.run-button {
  position: absolute;
  bottom: 1rem;
  right: 2rem;
  z-index: 10;
}

.output-pane {
  height: 30%;
  position: relative;
  border-top: 1px solid var(--el-border-color-light);
}
</style>
