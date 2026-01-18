import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto('http://localhost:8081');
await page.waitForLoadState('networkidle');

// Configure
await page.selectOption('select[data-terminal-protocol]', 'ssh');
await page.fill('input[data-terminal-host]', 'chat.korokorok.com');
await page.fill('input[data-terminal-port]', '2222');
await page.fill('input[data-terminal-username]', 'real-test-user');

// Connect
await page.click('button[data-terminal-connect]');
console.log('Clicked connect, waiting for connection...');

await page.waitForTimeout(8000);

// Get terminal output area
const outputSelector = '[data-terminal-output]';
const outputElement = await page.$(outputSelector);

if (outputElement) {
  const outputText = await outputElement.textContent();
  console.log('\n=== Terminal Output BEFORE typing ===');
  console.log(outputText || '[EMPTY]');
  console.log('Length:', (outputText || '').length);
} else {
  console.log('Terminal output element not found!');
}

// Type hello
const entrySelector = 'textarea[data-terminal-entry-buffer]';
const entry = await page.$(entrySelector);

if (entry) {
  await entry.focus();
  await entry.type('hello');
  console.log('\n✅ Typed "hello" in entry buffer');
  
  // Press Enter
  await page.keyboard.press('Enter');
  console.log('✅ Pressed Enter');
  
  await page.waitForTimeout(3000);
  
  // Get output again
  const outputAfter = await outputElement.textContent();
  console.log('\n=== Terminal Output AFTER typing hello ===');
  console.log(outputAfter || '[EMPTY]');
  console.log('Length:', (outputAfter || '').length);
  
  // Check if hello appears
  const hasHello = (outputAfter || '').toLowerCase().includes('hello');
  console.log('\n=== RESULT ===');
  if (hasHello) {
    console.log('❌ FAIL: "hello" FOUND in terminal output!');
    console.log('Echo suppression is NOT working!');
  } else {
    console.log('✅ PASS: "hello" NOT found in terminal output');
    console.log('Echo suppression is working correctly!');
  }
  
  await page.screenshot({ path: '/tmp/final-verification.png', fullPage: true });
  console.log('\nScreenshot saved to /tmp/final-verification.png');
} else {
  console.log('Entry buffer not found!');
}

await browser.close();
