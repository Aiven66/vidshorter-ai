const fs = require('fs');
const path = require('path');
const dir = 'src/lib/i18n/locales';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts'));
const overEscapedResults = [];
const unescapedResults = [];

for (const file of files) {
  const filePath = path.join(dir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  const overEscapedIssues = [];
  const unescapedIssues = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for over-escaped: \\\' (should be just \')
    if (line.includes("\\\\'")) {
      overEscapedIssues.push({ line: i + 1, content: line.trim().substring(0, 200) });
    }
    
    // Check for unescaped apostrophes in single-quoted strings
    // Strategy: find all single-quoted string values and check for bare apostrophes
    // A bare apostrophe inside a single-quoted string would look like: 'text's text'
    // We need to find patterns where ' appears between word characters inside a string
    
    // Find all string literals: 'content'
    // We'll look for the pattern: word'word inside what should be a string value
    const stringMatches = [...line.matchAll(/'([^'\\]*(?:\\.[^'\\]*)*)'/g)];
    for (const m of stringMatches) {
      const val = m[1];
      // Check for unescaped apostrophe: a ' not preceded by \
      for (let j = 0; j < val.length; j++) {
        if (val[j] === "'") {
          let backslashCount = 0;
          let k = j - 1;
          while (k >= 0 && val[k] === '\\') {
            backslashCount++;
            k--;
          }
          if (backslashCount === 0) {
            unescapedIssues.push({ 
              line: i + 1, 
              value: val.substring(Math.max(0, j - 20), Math.min(val.length, j + 20)),
              fullMatch: m[0].substring(0, 150)
            });
            break; // Only report once per string
          }
        }
      }
    }
  }
  
  if (overEscapedIssues.length > 0) {
    overEscapedResults.push({ file, issues: overEscapedIssues });
  }
  if (unescapedIssues.length > 0) {
    unescapedResults.push({ file, issues: unescapedIssues });
  }
}

console.log('=== OVER-ESCAPED (\\\\\\\') - produces wrong output like "video\\\'s" ===\n');
if (overEscapedResults.length === 0) {
  console.log('None found.\n');
} else {
  let total = 0;
  for (const r of overEscapedResults) {
    total += r.issues.length;
    console.log(`${r.file} (${r.issues.length} issues):`);
    for (const issue of r.issues) {
      console.log(`  Line ${issue.line}: ${issue.content}`);
    }
    console.log();
  }
  console.log(`Total: ${total} over-escaped instances in ${overEscapedResults.length} files\n`);
}

console.log('\n=== UNESCAPED - would cause syntax errors ===\n');
if (unescapedResults.length === 0) {
  console.log('None found.\n');
} else {
  let total = 0;
  for (const r of unescapedResults) {
    total += r.issues.length;
    console.log(`${r.file} (${r.issues.length} issues):`);
    for (const issue of r.issues) {
      console.log(`  Line ${issue.line}: near "${issue.value}" in ${issue.fullMatch}`);
    }
    console.log();
  }
  console.log(`Total: ${total} unescaped instances in ${unescapedResults.length} files\n`);
}
