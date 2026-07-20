const fs = require('fs');
const file = 'src/app/features/pdf/pdf.component.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace('private saveHistory(): void {', 'private saveHistory(): void {\n    console.log("Saving history. Current edits:", this.edits().size);');
content = content.replace('protected undo(event?: KeyboardEvent): void {', 'protected undo(event?: KeyboardEvent): void {\n    console.log("Undo triggered. Stack size:", this.undoStack().length);');
fs.writeFileSync(file, content);
