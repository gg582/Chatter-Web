#!/usr/bin/env node

/**
 * Manual Echo Suppression Verification Script
 * 
 * This script uses Playwright to manually verify that user input
 * does NOT appear in the terminal output area.
 * 
 * Run with: node tests/manual-echo-test.mjs
 */

import { chromium } from '@playwright/test';

async function runTest() {
  console.log('Starting manual echo suppression test...\n');
  
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to the application
    console.log('1. Navigating to http://localhost:8081...');
    await page.goto('http://localhost:8081');
    await page.waitForLoadState('networkidle');
    
    // Configure connection settings
    console.log('2. Configuring connection to chat.korokorok.com:2222...');
    await page.fill('input[data-terminal-host]', 'chat.korokorok.com');
    await page.fill('input[data-terminal-port]', '2222');
    await page.selectOption('select[data-terminal-protocol]', 'ssh');
    await page.click('button:has-text("Apply")');
    await page.waitForTimeout(1000);
    
    // Enter username
    console.log('3. Entering username...');
    await page.fill('input[data-terminal-username]', 'playwright-test');
    
    // Connect to server
    console.log('4. Connecting to server...');
    await page.click('button[data-terminal-connect]');
    
    // Wait for connection with timeout
    try {
      await page.waitForSelector('[data-terminal-status][data-state="connected"]', { 
        timeout: 20000 
      });
      console.log('5. ✓ Connected successfully!\n');
    } catch (error) {
      console.log('5. ⚠ Connection timeout - this is expected if server is unreachable\n');
      console.log('   Please verify manually by:');
      console.log('   1. Opening browser to http://localhost:8081');
      console.log('   2. Connecting to chat.korokorok.com:2222 (SSH)');
      console.log('   3. Typing "hello" in the entry field');
      console.log('   4. Checking that "hello" does NOT appear in [ ] brackets in output\n');
      await page.screenshot({ path: '/tmp/connection-timeout.png' });
      return;
    }
    
    // Wait for terminal to stabilize
    await page.waitForTimeout(3000);
    
    // Get terminal output before typing
    console.log('6. Capturing terminal state before typing...');
    const outputBefore = await page.textContent('[data-terminal-output]') || '';
    console.log(`   Output length before: ${outputBefore.length} characters`);
    
    // Type "hello" in the entry buffer
    console.log('7. Typing "hello" in entry buffer...');
    const entryBuffer = page.locator('textarea[data-terminal-entry-buffer]');
    await entryBuffer.focus();
    await entryBuffer.fill('hello');
    
    // Press Enter to send
    console.log('8. Pressing Enter to send...');
    await entryBuffer.press('Enter');
    
    // Wait for response
    await page.waitForTimeout(2000);
    
    // Get terminal output after typing
    console.log('9. Capturing terminal state after typing...');
    const outputAfter = await page.textContent('[data-terminal-output]') || '';
    console.log(`   Output length after: ${outputAfter.length} characters`);
    
    // Check if "hello" appears in the output
    const newContent = outputAfter.substring(outputBefore.length);
    const containsHello = newContent.toLowerCase().includes('hello');
    
    // Take screenshot for manual verification
    await page.screenshot({ path: '/tmp/echo-test-result.png', fullPage: true });
    
    console.log('\n=== TEST RESULT ===');
    if (containsHello) {
      console.log('❌ FAIL: "hello" was found in terminal output');
      console.log('   New content:', newContent.substring(0, 200));
      console.log('\n   This means echo suppression is NOT working correctly.');
      console.log('   Screenshot saved to: /tmp/echo-test-result.png');
      process.exit(1);
    } else {
      console.log('✓ PASS: "hello" was NOT found in terminal output');
      console.log('   Echo suppression is working correctly!');
      console.log('   Screenshot saved to: /tmp/echo-test-result.png');
    }
    
  } catch (error) {
    console.error('\n❌ Error during test:', error.message);
    await page.screenshot({ path: '/tmp/echo-test-error.png' });
    throw error;
  } finally {
    // Keep browser open for manual inspection
    console.log('\n  Browser will stay open for 10 seconds for manual inspection...');
    await page.waitForTimeout(10000);
    await browser.close();
  }
}

runTest().catch(console.error);
