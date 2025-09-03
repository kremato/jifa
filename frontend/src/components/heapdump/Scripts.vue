<script setup lang="ts">

import {useAnalysisApiRequester} from "@/composables/analysis-api-requester";

const {request} = useAnalysisApiRequester();

const inputText = ref('')
const scriptResult = ref('')

const submitText = async () => {
  try {
    scriptResult.value = await request("script", {scriptTextInJS: inputText.value});
  } catch (error) {
    scriptResult.value =
        `Error processing script text.\n
        Error code: ${error.errorCode}\n
        Error message: ${error.message}`
  }
};

</script>

<template>
  <div>
    <form @submit.prevent="submitText">
      <label for="inputText">Enter Script Text in JS:</label>
      <textarea id="inputText" v-model="inputText" type="text"/>
      <button type="submit">Submit</button>
    </form>
    <div v-if="scriptResult" class="response-container">
      <h3>Response:</h3>
      <p>{{ scriptResult }}</p>
    </div>
  </div>
</template>

<style scoped>
textarea {
  width: 100%;
  height: 100px;
  resize: both;
}

.response-container {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #ccc;
  padding: 10px;
}
</style>