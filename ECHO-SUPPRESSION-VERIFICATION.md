# Echo Suppression Verification Guide

## Problem Statement
Previously, when users typed text in the entry field (e.g., "hello") and pressed Enter, the text would appear in the terminal output area because the SSH server echoed it back. This was redundant since the server handles all processing.

## Solution
Enhanced the echo suppression logic to register ALL user input variations (trimmed, untrimmed) before sending to the server. When the server echoes back, the text is matched and suppressed from display.

## How to Verify

### Option 1: Automated Playwright Test
```bash
# Start the server
npm start

# In another terminal, run the manual test
node tests/manual-echo-test.mjs
```

The test will:
1. Connect to chat.korokorok.com:2222 (SSH)
2. Type "hello" in the entry field
3. Press Enter
4. Verify "hello" does NOT appear in the terminal output
5. Save a screenshot to `/tmp/echo-test-result.png`

### Option 2: Manual Browser Test
1. Start the server: `npm start`
2. Open browser to `http://localhost:8081`
3. Configure connection:
   - Host: `chat.korokorok.com`
   - Port: `2222`
   - Protocol: `SSH`
4. Click "Apply"
5. Enter a username
6. Click "Connect"
7. Wait for connection
8. Type "hello" in the entry buffer
9. Press Enter
10. **Verify**: "hello" should NOT appear in the terminal output area

### Expected Behavior
- ✅ **PASS**: User typed "hello" is NOT visible in terminal output
- ❌ **FAIL**: User typed "hello" IS visible in terminal output (echo not suppressed)

## Technical Details

### Code Changes
File: `src/ui/terminal.ts`

Function: `handleUserLineSent()`

**Before:**
```typescript
const handleUserLineSent = (value: string) => {
  if (!value || !value.trim()) {
    return;  // Early return meant blank inputs weren't registered
  }
  
  maybeSendLightModePaletteCommand();
  
  const trimmed = value.trim();
  registerOutgoingEchoCandidate(trimmed);  // Only trimmed version
  // ...
};
```

**After:**
```typescript
const handleUserLineSent = (value: string) => {
  const trimmed = value.trim();
  
  // Register ALL variations to catch echoes
  if (trimmed) {
    registerOutgoingEchoCandidate(trimmed);
  }
  if (value && value !== trimmed) {
    registerOutgoingEchoCandidate(value);  // Also untrimmed
  }
  
  if (!trimmed) {
    return;  // Now returns AFTER registration
  }
  
  maybeSendLightModePaletteCommand();
  // ...
};
```

### How Echo Suppression Works
1. User types "hello" and presses Enter
2. `handleUserLineSent("hello")` is called
3. Both "hello" (trimmed) and any untrimmed version are registered in `pendingOutgoingEchoes` array
4. Text is sent to server: `socket.send("hello\n")`
5. Server processes and echoes back (possibly with ANSI codes): `"\x1b[32mhello\x1b[0m\r\n"`
6. Echo received in `deliverIncomingPayload()`
7. `filterOutgoingEchoesFromChunk()` processes the echo
8. `normaliseEchoText()` strips ANSI codes and normalizes: `"hello"`
9. Match found in `pendingOutgoingEchoes`
10. Echo suppressed - NOT displayed on screen
11. Only server's actual response is shown

### Key Functions
- `registerOutgoingEchoCandidate(value)`: Adds user input to suppression queue
- `normaliseEchoText(value)`: Normalizes text for comparison (strips ANSI, collapses whitespace, trims)
- `shouldSuppressOutgoingEcho(line)`: Checks if line matches a registered echo
- `filterOutgoingEchoesFromChunk(chunk)`: Filters echoes from incoming data stream

## Testing Against Real Server

### Requirements
- Network access to chat.korokorok.com:2222
- SSH server must be running
- Valid username (any test username should work)

### Test Procedure
1. Connect to the server
2. Type various inputs: "hello", "test", "/help", etc.
3. For each input, verify it does NOT appear in the output

### Common Issues
- **Echo still appears**: Check if normaliseEchoText() normalization is matching correctly
- **Connection fails**: Server might be down or network blocked
- **Partial echo**: Check for edge cases in whitespace handling

## Deployment Checklist
- [x] Code changes implemented
- [x] Built successfully with `npm run build`
- [x] Manual test script created
- [ ] Tested against chat.korokorok.com:2222
- [ ] Code review completed
- [ ] PR merged
- [ ] Deployed to production
- [ ] Verified in production environment
