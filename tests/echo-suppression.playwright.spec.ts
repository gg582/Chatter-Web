import { test, expect } from '@playwright/test';

/**
 * Echo Suppression Test
 * 
 * This test verifies that user input from the entry field does NOT appear on screen.
 * The remote server (chat.korokorok.com:2222) handles all processing, and we should
 * suppress any echo of the user's typed input from being displayed in the terminal output.
 * 
 * Requirements:
 * - Target server: chat.korokorok.com
 * - Protocol: SSH
 * - Port: 2222
 * - Test input: "hello"
 * - Expected: "hello" should NOT appear in the terminal output area
 */

test.describe('Terminal Echo Suppression', () => {
  test.beforeEach(async ({ page }) => {
    // Start the development server on a specific port
    // Note: This test assumes the server is running externally
    await page.goto('http://localhost:8081');
    
    // Wait for the page to be fully loaded
    await page.waitForLoadState('networkidle');
  });

  test('should NOT display user input "hello" in terminal output', async ({ page }) => {
    // Step 1: Configure connection settings
    // Find and fill the host input
    const hostInput = page.locator('input[data-terminal-host]');
    await hostInput.fill('chat.korokorok.com');
    
    // Find and fill the port input
    const portInput = page.locator('input[data-terminal-port]');
    await portInput.fill('2222');
    
    // Select SSH protocol
    const protocolSelect = page.locator('select[data-terminal-protocol]');
    await protocolSelect.selectOption('ssh');
    
    // Apply settings
    const applyButton = page.locator('button:has-text("Apply")').first();
    await applyButton.click();
    
    // Wait a bit for settings to apply
    await page.waitForTimeout(500);
    
    // Step 2: Enter username
    const usernameInput = page.locator('input[data-terminal-username]');
    await usernameInput.fill('testuser');
    
    // Step 3: Connect to the server
    const connectButton = page.locator('button[data-terminal-connect]').first();
    await connectButton.click();
    
    // Wait for connection to establish (with timeout)
    await page.waitForSelector('[data-terminal-status][data-state="connected"]', { 
      timeout: 15000 
    });
    
    // Wait additional time for the terminal to fully initialize
    await page.waitForTimeout(2000);
    
    // Step 4: Get the terminal output area before typing
    const terminalOutput = page.locator('[data-terminal-output]');
    const outputBeforeTyping = await terminalOutput.textContent() || '';
    
    // Step 5: Type "hello" in the entry buffer
    const entryBuffer = page.locator('textarea[data-terminal-entry-buffer]');
    await entryBuffer.focus();
    await entryBuffer.fill('hello');
    
    // Step 6: Press Enter to send the input
    await entryBuffer.press('Enter');
    
    // Wait a bit for any potential echo to appear
    await page.waitForTimeout(1000);
    
    // Step 7: Get the terminal output after typing
    const outputAfterTyping = await terminalOutput.textContent() || '';
    
    // Step 8: Verify that "hello" does NOT appear in the terminal output
    // We check if the new content (difference) contains "hello"
    const newContent = outputAfterTyping.substring(outputBeforeTyping.length);
    
    // The test FAILS if "hello" appears in the output
    const containsHello = newContent.toLowerCase().includes('hello');
    
    if (containsHello) {
      console.error('FAILURE: User input "hello" appeared in terminal output');
      console.error('New content:', newContent);
      
      // Take a screenshot for debugging
      await page.screenshot({ path: '/tmp/echo-suppression-failure.png' });
      
      throw new Error(
        'Echo suppression FAILED: User input "hello" should NOT appear in terminal output, ' +
        'but it was found in the displayed content. This means the entry field echo is not being suppressed.'
      );
    }
    
    console.log('SUCCESS: User input "hello" was NOT displayed in terminal output');
    console.log('Echo suppression is working correctly');
    
    // Disconnect
    const disconnectButton = page.locator('button[data-terminal-disconnect]').first();
    await disconnectButton.click();
  });

  test('should suppress multiple user inputs', async ({ page }) => {
    // Configure and connect (similar to previous test)
    const hostInput = page.locator('input[data-terminal-host]');
    await hostInput.fill('chat.korokorok.com');
    
    const portInput = page.locator('input[data-terminal-port]');
    await portInput.fill('2222');
    
    const protocolSelect = page.locator('select[data-terminal-protocol]');
    await protocolSelect.selectOption('ssh');
    
    const applyButton = page.locator('button:has-text("Apply")').first();
    await applyButton.click();
    await page.waitForTimeout(500);
    
    const usernameInput = page.locator('input[data-terminal-username]');
    await usernameInput.fill('testuser2');
    
    const connectButton = page.locator('button[data-terminal-connect]').first();
    await connectButton.click();
    
    await page.waitForSelector('[data-terminal-status][data-state="connected"]', { 
      timeout: 15000 
    });
    await page.waitForTimeout(2000);
    
    const terminalOutput = page.locator('[data-terminal-output]');
    const entryBuffer = page.locator('textarea[data-terminal-entry-buffer]');
    
    const testInputs = ['test1', 'test2', 'hello world', '/help'];
    
    for (const input of testInputs) {
      const outputBefore = await terminalOutput.textContent() || '';
      
      await entryBuffer.focus();
      await entryBuffer.fill(input);
      await entryBuffer.press('Enter');
      await page.waitForTimeout(800);
      
      const outputAfter = await terminalOutput.textContent() || '';
      const newContent = outputAfter.substring(outputBefore.length);
      
      const containsInput = newContent.toLowerCase().includes(input.toLowerCase());
      
      if (containsInput) {
        await page.screenshot({ path: `/tmp/echo-suppression-failure-${input}.png` });
        throw new Error(
          `Echo suppression FAILED for input "${input}": ` +
          'User input should NOT appear in terminal output'
        );
      }
    }
    
    console.log('SUCCESS: All user inputs were properly suppressed');
    
    // Disconnect
    const disconnectButton = page.locator('button[data-terminal-disconnect]').first();
    await disconnectButton.click();
  });
});
