#!/usr/bin/env node

/**
 * Visual Verification Script with Screenshots
 * 
 * This script opens the application, configures it, and takes screenshots
 * to visually verify that echo suppression is working.
 */

import { chromium } from '@playwright/test';

async function takeScreenshots() {
  console.log('🚀 Starting visual verification with screenshots...\n');
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  try {
    // Step 1: Navigate to the application
    console.log('📱 Step 1: Loading application...');
    await page.goto('http://localhost:8081', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    // Take initial screenshot
    await page.screenshot({ 
      path: '/tmp/screenshot-01-initial-load.png',
      fullPage: true 
    });
    console.log('   ✅ Screenshot saved: /tmp/screenshot-01-initial-load.png\n');

    // Step 2: Open settings to configure connection
    console.log('⚙️  Step 2: Configuring connection settings...');
    
    // Try to find and expand settings if they're collapsed
    const settingsPanel = page.locator('[data-terminal-target-form]');
    if (await settingsPanel.isVisible()) {
      console.log('   Settings panel is visible');
    }
    
    // Fill in connection details
    await page.fill('input[data-terminal-host]', 'chat.korokorok.com');
    await page.fill('input[data-terminal-port]', '2222');
    await page.selectOption('select[data-terminal-protocol]', 'ssh');
    
    await page.screenshot({ 
      path: '/tmp/screenshot-02-settings-filled.png',
      fullPage: true 
    });
    console.log('   ✅ Screenshot saved: /tmp/screenshot-02-settings-filled.png\n');

    // Step 3: Apply settings
    console.log('💾 Step 3: Applying settings...');
    const applyButton = page.locator('button:has-text("Apply")').first();
    await applyButton.click();
    await page.waitForTimeout(1000);
    
    await page.screenshot({ 
      path: '/tmp/screenshot-03-settings-applied.png',
      fullPage: true 
    });
    console.log('   ✅ Screenshot saved: /tmp/screenshot-03-settings-applied.png\n');

    // Step 4: Enter username
    console.log('👤 Step 4: Entering username...');
    await page.fill('input[data-terminal-username]', 'test-user-screenshot');
    
    await page.screenshot({ 
      path: '/tmp/screenshot-04-username-entered.png',
      fullPage: true 
    });
    console.log('   ✅ Screenshot saved: /tmp/screenshot-04-username-entered.png\n');

    // Step 5: Show the entry buffer clearly
    console.log('📝 Step 5: Focusing on entry buffer...');
    const entryBuffer = page.locator('textarea[data-terminal-entry-buffer]');
    await entryBuffer.focus();
    await page.waitForTimeout(500);
    
    await page.screenshot({ 
      path: '/tmp/screenshot-05-entry-focused.png',
      fullPage: true 
    });
    console.log('   ✅ Screenshot saved: /tmp/screenshot-05-entry-focused.png\n');

    // Step 6: Type "hello" in the entry buffer (but don't send it yet)
    console.log('⌨️  Step 6: Typing "hello" in entry buffer...');
    await entryBuffer.fill('hello');
    await page.waitForTimeout(500);
    
    await page.screenshot({ 
      path: '/tmp/screenshot-06-hello-typed.png',
      fullPage: true 
    });
    console.log('   ✅ Screenshot saved: /tmp/screenshot-06-hello-typed.png');
    console.log('   📌 NOTE: "hello" should be visible in the ENTRY BUFFER only\n');

    // Step 7: Get terminal output BEFORE pressing Enter
    console.log('📊 Step 7: Capturing terminal output state...');
    const terminalOutput = page.locator('[data-terminal-output]');
    const outputBefore = await terminalOutput.textContent() || '';
    console.log(`   Terminal output length before: ${outputBefore.length} characters`);
    console.log(`   Terminal output preview: "${outputBefore.substring(0, 100).trim()}..."\n`);

    // Step 8: Try to connect (this will likely fail without network access)
    console.log('🔌 Step 8: Attempting to connect...');
    const connectButton = page.locator('button[data-terminal-connect]').first();
    
    // Check if connect button is enabled
    const isEnabled = await connectButton.isEnabled();
    console.log(`   Connect button enabled: ${isEnabled}`);
    
    if (isEnabled) {
      await connectButton.click();
      console.log('   Clicked connect button');
      
      // Wait a bit to see if connection happens
      await page.waitForTimeout(3000);
      
      await page.screenshot({ 
        path: '/tmp/screenshot-07-connection-attempt.png',
        fullPage: true 
      });
      console.log('   ✅ Screenshot saved: /tmp/screenshot-07-connection-attempt.png\n');
    } else {
      console.log('   ⚠️  Connect button is disabled (need username or target)\n');
    }

    // Step 9: Show what happens when Enter is pressed (simulation)
    console.log('⏎  Step 9: Simulating Enter press (without connection)...');
    console.log('   NOTE: Without server connection, this shows the local behavior\n');
    
    // Press Enter in the entry buffer
    await entryBuffer.press('Enter');
    await page.waitForTimeout(1000);
    
    await page.screenshot({ 
      path: '/tmp/screenshot-08-after-enter-press.png',
      fullPage: true 
    });
    console.log('   ✅ Screenshot saved: /tmp/screenshot-08-after-enter-press.png\n');

    // Step 10: Check terminal output AFTER pressing Enter
    const outputAfter = await terminalOutput.textContent() || '';
    const newContent = outputAfter.substring(outputBefore.length);
    
    console.log('📋 Step 10: Analyzing terminal output...');
    console.log(`   Terminal output length after: ${outputAfter.length} characters`);
    console.log(`   New content added: ${newContent.length} characters`);
    console.log(`   New content preview: "${newContent.substring(0, 100).trim()}..."\n`);

    // Step 11: Final analysis
    console.log('🔍 Step 11: Echo suppression analysis...');
    const containsHello = newContent.toLowerCase().includes('hello');
    
    if (containsHello) {
      console.log('   ❌ WARNING: "hello" was found in new terminal output!');
      console.log('   This could mean:');
      console.log('      1. Echo suppression is not working (BUG)');
      console.log('      2. Server actually responded with "hello" (OK)');
      console.log('      3. Error message contains "hello" (OK)\n');
    } else {
      console.log('   ✅ GOOD: "hello" was NOT found in new terminal output');
      console.log('   This suggests echo suppression is working correctly\n');
    }

    // Final screenshot
    await page.screenshot({ 
      path: '/tmp/screenshot-09-final-state.png',
      fullPage: true 
    });
    console.log('   ✅ Screenshot saved: /tmp/screenshot-09-final-state.png\n');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📸 ALL SCREENSHOTS SAVED TO /tmp/');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\nScreenshots created:');
    console.log('  1. screenshot-01-initial-load.png       - Initial page load');
    console.log('  2. screenshot-02-settings-filled.png    - Connection settings filled');
    console.log('  3. screenshot-03-settings-applied.png   - Settings applied');
    console.log('  4. screenshot-04-username-entered.png   - Username entered');
    console.log('  5. screenshot-05-entry-focused.png      - Entry buffer focused');
    console.log('  6. screenshot-06-hello-typed.png        - "hello" typed in entry');
    console.log('  7. screenshot-07-connection-attempt.png - Connection attempted');
    console.log('  8. screenshot-08-after-enter-press.png  - After pressing Enter');
    console.log('  9. screenshot-09-final-state.png        - Final state');
    console.log('\n🔑 KEY VERIFICATION POINTS:');
    console.log('  • In screenshot-06: "hello" should be in ENTRY BUFFER');
    console.log('  • In screenshot-08/09: "hello" should NOT be in TERMINAL OUTPUT');
    console.log('  • Entry buffer is the textarea at the bottom');
    console.log('  • Terminal output is the main display area above it\n');

  } catch (error) {
    console.error('\n❌ Error during screenshot capture:', error.message);
    await page.screenshot({ path: '/tmp/screenshot-ERROR.png' });
    console.log('Error screenshot saved to /tmp/screenshot-ERROR.png\n');
    throw error;
  } finally {
    await browser.close();
    console.log('✅ Browser closed\n');
  }
}

// Run the screenshot capture
takeScreenshots().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
