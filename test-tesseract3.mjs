import { createWorker } from 'tesseract.js';

async function run() {
  const worker = await createWorker('por', 1, { logger: () => {} });
  const { data } = await worker.recognize('https://tesseract.projectnaptha.com/img/eng_bw.png', undefined, { blocks: true });
  
  if (data.blocks?.[0]?.paragraphs?.[0]?.lines?.[0]) {
    const line = data.blocks[0].paragraphs[0].lines[0];
    console.log("Line has words?", !!line.words);
    if (line.words) {
      console.log("Word:", line.words[0].text, line.words[0].bbox);
    }
  }
  await worker.terminate();
}

run().catch(console.error);
