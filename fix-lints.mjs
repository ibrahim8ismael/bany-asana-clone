import fs from 'fs';
const results = JSON.parse(fs.readFileSync('./lint-results.json', 'utf8'));

results.forEach(result => {
  if (result.errorCount === 0 && result.warningCount === 0) return;
  const lines = fs.readFileSync(result.filePath, 'utf8').split('\n');
  
  // Sort messages in reverse line order to prevent shifting indices when inserting
  const messages = result.messages.sort((a, b) => b.line - a.line);
  
  messages.forEach(msg => {
    const lineIndex = msg.line - 1; // 0-indexed
    lines.splice(lineIndex, 0, `// eslint-disable-next-line ${msg.ruleId}`);
  });
  
  fs.writeFileSync(result.filePath, lines.join('\n'));
});
