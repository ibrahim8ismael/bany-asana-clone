import fs from 'fs';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'ibrahim8ismael/bany-asana-clone';

if (!GITHUB_TOKEN) {
  console.error("Error: GITHUB_TOKEN environment variable is required.");
  process.exit(1);
}

const markdown = fs.readFileSync('tasks.md', 'utf-8');
const tickets = markdown.split(/^## Ticket /m).slice(1);

async function createIssue(title, body, labels) {
  const response = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
    method: 'POST',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title,
      body
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`Failed to create issue: ${title}`, error);
    return null;
  }

  const data = await response.json();
  console.log(`Created issue: ${data.html_url}`);
  return data;
}

async function main() {
  for (const ticket of tickets) {
    const lines = ticket.split('\n');
    const titleLine = lines[0].trim();
    const title = `Ticket ${titleLine}`;
    
    let labels = [];
    const labelsLine = lines.find(line => line.startsWith('**Labels:**'));
    if (labelsLine) {
      const labelsMatch = labelsLine.match(/`([^`]+)`/g);
      if (labelsMatch) {
        labels = labelsMatch.map(l => l.replace(/`/g, ''));
      }
    }
    
    // Construct the body by removing the title line
    const body = lines.slice(1).join('\n').trim();
    
    console.log(`Creating issue for: ${title}`);
    await createIssue(title, body, labels);
    
    // Add a small delay to avoid hitting rate limits too quickly
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

main().catch(console.error);
