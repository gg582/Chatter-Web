import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto('http://localhost:8081');
  await page.waitForTimeout(2000);
  
  console.log('=== Checking page elements ===');
  
  // Check if we're on login or terminal screen
  const loginConnect = await page.$('button[data-login-connect]');
  const terminalOutput = await page.$('[data-terminal-output]');
  const entryBuffer = await page.$('textarea[data-terminal-entry-buffer]');
  
  console.log('Login connect button:', loginConnect ? 'FOUND' : 'NOT FOUND');
  console.log('Terminal output:', terminalOutput ? 'FOUND' : 'NOT FOUND');
  console.log('Entry buffer:', entryBuffer ? 'FOUND' : 'NOT FOUND');
  
  if (terminalOutput) {
    const text = await terminalOutput.textContent();
    console.log('\n=== Terminal output content ===');
    console.log(text || '[EMPTY]');
    console.log('Length:', (text || '').length);
  }
  
  if (entryBuffer) {
    const bufferValue = await entryBuffer.inputValue();
    console.log('\n=== Entry buffer value ===');
    console.log(bufferValue || '[EMPTY]');
  }
  
} catch (error) {
  console.error('Error:', error.message);
}

await browser.close();
