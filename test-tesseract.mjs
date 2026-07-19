import { createWorker } from 'tesseract.js';
import fs from 'fs';

async function run() {
  const worker = await createWorker('por', 1, {
    logger: m => console.log(m)
  });
  
  // Use a sample image or a base64 string
  const result = await worker.recognize('https://tesseract.projectnaptha.com/img/eng_bw.png');
  console.log("Keys:", Object.keys(result.data));
  console.log("Blocks length:", result.data.blocks?.length);
  console.log("Words length:", result.data.words?.length);
  console.log("Lines length:", result.data.lines?.length);
  console.log("First block:", JSON.stringify(result.data.blocks?.[0], null, 2));
  
  await worker.terminate();
}

run().catch(console.error);
