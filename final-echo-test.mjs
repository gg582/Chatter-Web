import { chromium } from '@playwright/test';

console.log('🚀 Starting REAL echo suppression test...\n');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto('http://localhost:8081');
console.log('✅ Page loaded');

// Wait for page to be ready
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1000);

// Check initial state
let status = await page.getAttribute('[data-terminal-status]', 'data-state');
console.log(`Status: ${status || 'disconnected'}`);

// Fill connection details (on login screen)
console.log('\n📝 Filling connection details...');
await page.fill('[data-login-host]', 'chat.korokorok.com');
await page.fill('[data-login-port]', '2222');  
await page.selectOption('[data-login-protocol]', 'ssh');
await page.fill('[data-login-username]', 'echo-test-user');

console.log('✅ Connection details filled');

// Click connect
console.log('\n🔌 Connecting to server...');
await page.click('button[data-login-connect]');

// Wait for connection
await page.waitForTimeout(10000);

// Check if connected
status = await page.getAttribute('[data-terminal-status]', 'data-state');
console.log(`Status after connect: ${status || 'unknown'}`);

// Get terminal output BEFORE typing
const outputBefore = await page.evaluate(() => {
  const el = document.querySelector('[data-terminal-output]');
  return el ? el.textContent : '';
});

console.log('\n=== Terminal Output BEFORE typing ===');
console.log(`Length: ${outputBefore.length} characters`);
console.log(`Preview: "${outputBefore.substring(0, 200)}"`);

// Type hello in entry buffer
console.log('\n⌨️  Typing "hello" in entry buffer...');
const entry = await page.$('textarea[data-terminal-entry-buffer]');
if (entry) {
  await entry.focus();
  await entry.type('hello', { delay: 100 });
  console.log('✅ Typed "hello"');
  
  // Press Enter  
  console.log('⏎  Pressing Enter...');
  await page.keyboard.press('Enter');
  console.log('✅ Pressed Enter');
  
  // Wait for response
  await page.waitForTimeout(3000);
  
  // Get terminal output AFTER typing
  const outputAfter = await page.evaluate(() => {
    const el = document.querySelector('[data-terminal-output]');
    return el ? el.textContent : '';
  });
  
  console.log('\n=== Terminal Output AFTER typing ===');
  console.log(`Length: ${outputAfter.length} characters`);
  console.log(`Preview: "${outputAfter.substring(0, 200)}"`);
  
  // Check if "hello" appears
  const newContent = outputAfter.substring(outputBefore.length);
  const containsHello = newContent.toLowerCase().includes('hello');
  
  console.log('\n' + '='.repeat(60));
  console.log('FINAL RESULT');
  console.log('='.repeat(60));
  
  if (containsHello) {
    console.log('❌ FAIL: "hello" WAS FOUND in terminal output!');
    console.log('Echo suppression is NOT working!');
    console.log(`\nNew content: "${newContent.substring(0, 200)}"`);
  } else {
    console.log('✅ PASS: "hello" was NOT found in terminal output');
    console.log('Echo suppression is working correctly!');
  }
  
  console.log('='.repeat(60));
  
  await page.screenshot({ path: '/tmp/final-test-result.png', fullPage: true });
  console.log('\n📸 Screenshot saved: /tmp/final-test-result.png');
  
} else {
  console.log('❌ Entry buffer not found!');
}

await browser.close();
