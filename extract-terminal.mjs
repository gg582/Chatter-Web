import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: false, slowMo: 100 });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto('http://localhost:8081');
await page.waitForLoadState('networkidle');

// Extract terminal output using JavaScript
const outputContent = await page.evaluate(() => {
  const outputEl = document.querySelector('[data-terminal-output]');
  return {
    text: outputEl ? outputEl.textContent : null,
    html: outputEl ? outputEl.innerHTML.substring(0, 500) : null,
    exists: !!outputEl
  };
});

console.log('=== Terminal Output Element ===');
console.log('Exists:', outputContent.exists);
console.log('Text:', outputContent.text || '[EMPTY]');
console.log('HTML preview:', outputContent.html || '[EMPTY]');

// Check entry buffer
const entryContent = await page.evaluate(() => {
  const entry = document.querySelector('textarea[data-terminal-entry-buffer]');
  return {
    value: entry ? entry.value : null,
    exists: !!entry
  };
});

console.log('\n=== Entry Buffer ===');
console.log('Exists:', entryContent.exists);
console.log('Value:', entryContent.value || '[EMPTY]');

await page.screenshot({ path: '/tmp/current-state.png', fullPage: true });
console.log('\nScreenshot: /tmp/current-state.png');

setTimeout(() => browser.close(), 3000);
