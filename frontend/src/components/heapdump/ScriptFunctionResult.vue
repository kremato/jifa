<script setup lang="ts">
import { prettySize } from '@/support/utils';
import CommonTable from '@/components/heapdump/CommonTable.vue';
import { hdt } from '@/components/heapdump/utils';
import { getIcon } from '@/components/heapdump/icon-helper';
import { t } from '@/i18n/i18n';
import { useSelectedObject } from '@/composables/heapdump/selected-object';
import { useMonacoFileManager } from '@/composables/heapdump/monaco-file-manager';
import { commonMenu as menu } from '@/components/heapdump/menu';

const { selectedObjectId } = useSelectedObject();
const { getAllMonacoFiles } = useMonacoFileManager();

const props = defineProps<{
  objectId: number;
  scriptPath: string;
  funcToExecute: string;
}>();

const showDataTable = ref(true);
const textResult = ref(null);
const processing = ref(true);

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
          entryPath: props.scriptPath,
          sourceMap: Object.fromEntries(getAllMonacoFiles()),
          exportedFuncName: props.funcToExecute,
          objectId: props.objectId
        };
      },
      respMapper(r) {
        if (r.oqlResult.type == TEXT) {
          showDataTable.value = false;
          textResult.value = [{ text: r.oqlResult.text }];
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
  <el-scrollbar>
    <div style="flex-grow: 1; overflow: auto">
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
  </el-scrollbar>
</template>
