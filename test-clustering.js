function mergeParagraphBlocks(blocks) {
  if (blocks.length === 0) return [];

  // Passo 1: Agrupar palavras em linhas
  // Dois blocos pertencem à mesma linha se têm overlap vertical > 40% da altura do menor
  // e estão próximos horizontalmente (distância < 3x a altura).
  const lines = [];
  
  // Ordena por Y e depois X
  let sorted = [...blocks].sort((a, b) => a.y - b.y || a.x - b.x);
  
  while (sorted.length > 0) {
    const currentLine = [sorted.shift()];
    
    let added;
    do {
      added = false;
      const ref = currentLine[currentLine.length - 1]; // last word in line
      
      for (let i = 0; i < sorted.length; i++) {
        const candidate = sorted[i];
        
        const yOverlap = Math.max(0, Math.min(ref.y + ref.h, candidate.y + candidate.h) - Math.max(ref.y, candidate.y));
        const minH = Math.min(ref.h, candidate.h);
        
        // Horizontal gap
        const hGap = candidate.x - (ref.x + ref.w);
        
        if (yOverlap > minH * 0.4 && hGap > -minH && hGap < minH * 3.0) {
          currentLine.push(candidate);
          sorted.splice(i, 1);
          added = true;
          break;
        }
      }
    } while (added);
    
    // Sort words in line by X
    currentLine.sort((a, b) => a.x - b.x);
    lines.push(currentLine);
  }
  
  // Computar bounds das linhas
  const lineStats = lines.map(words => {
    const minX = Math.min(...words.map(w => w.x));
    const minY = Math.min(...words.map(w => w.y));
    const maxX = Math.max(...words.map(w => w.x + w.w));
    const maxY = Math.max(...words.map(w => w.y + w.h));
    const text = words.map(w => w.text).join(' ');
    // font sizes
    const fSizes = words.map(w => w.fontSize || w.h).sort((a, b) => a - b);
    const fontSize = fSizes[fSizes.length >> 1];
    
    return {
      words, text,
      x: minX, y: minY, w: maxX - minX, h: maxY - minY,
      fontSize
    };
  });
  
  // Sort lines by Y
  lineStats.sort((a, b) => a.y - b.y);
  
  // Passo 2: Agrupar linhas em parágrafos
  const paragraphs = [];
  
  for (const line of lineStats) {
    let placed = false;
    if (paragraphs.length > 0) {
      const lastPara = paragraphs[paragraphs.length - 1];
      const lastLine = lastPara[lastPara.length - 1];
      
      const gap = line.y - (lastLine.y + lastLine.h);
      const minH = Math.min(line.h, lastLine.h);
      
      const xOverlap = Math.max(0, Math.min(line.x + line.w, lastLine.x + lastLine.w) - Math.max(line.x, lastLine.x));
      
      // Lines are in the same paragraph if:
      // 1. gap is small (between -0.5*minH and 2.5*minH)
      // 2. they overlap horizontally
      if (gap > -minH * 0.8 && gap < minH * 2.5 && xOverlap > 0) {
        lastPara.push(line);
        placed = true;
      }
    }
    if (!placed) {
      paragraphs.push([line]);
    }
  }
  
  // Construir blocos finais
  return paragraphs.map(lines => {
    const minX = Math.min(...lines.map(l => l.x));
    const minY = Math.min(...lines.map(l => l.y));
    const maxX = Math.max(...lines.map(l => l.x + l.w));
    const maxY = Math.max(...lines.map(l => l.y + l.h));
    
    const text = lines.map(l => l.text).join('\n');
    
    const fSizes = lines.map(l => l.fontSize).sort((a, b) => a - b);
    const fontSize = fSizes[fSizes.length >> 1];
    
    const avgLineH = lines.reduce((sum, l) => sum + l.h, 0) / lines.length;
    
    return {
      text,
      x: minX, y: minY, w: maxX - minX, h: maxY - minY,
      fontSize, lineHeight: avgLineH
    };
  });
}
console.log("Algorithm OK.");
