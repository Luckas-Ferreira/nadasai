import { createWorker } from 'tesseract.js';
import fs from 'fs';

async function run() {
  const worker = await createWorker('por', 1, {
    logger: m => {}
  });
  
  const result = await worker.recognize('https://tesseract.projectnaptha.com/img/eng_bw.png', {
    rotateAuto: true
  }, {
    blocks: true,
    words: true
  });
  console.log("Blocks length:", result.data.blocks?.length);
  
  const result2 = await worker.recognize('https://tesseract.projectnaptha.com/img/eng_bw.png', undefined, { blocks: true });
  console.log("Blocks 2 length:", result2.data.blocks?.length);

  await worker.terminate();
}

run().catch(console.error);
