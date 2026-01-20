
const ANSI_ESCAPE_SEQUENCE_PATTERN = /\u001b\[[0-9;?]*[ -\/] *[@-~]/gu;

const stripAnsiSequences = (value) => value.replace(ANSI_ESCAPE_SEQUENCE_PATTERN, '');

// Current implementation
const normaliseEchoText_Current = (value) =>
  stripAnsiSequences(value)
    .replace(/\u0008/g, '')
    .replace(/\r/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Proposed implementation
const normaliseEchoText_Proposed = (value) =>
  stripAnsiSequences(value)
    .replace(/^\Щ\d+\]/, '') // Strip [532] at start
    .replace(/<[^>]+>/g, '') // Strip <vim-1>
    .replace(/\u0008/g, '')
    .replace(/\r/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const userInput = "this is really weird, always echoes back.";
const serverEcho = "[532]<vim-1> this is really weird, always echoes back.";

console.log("User Input: ", userInput);
console.log("Server Echo:", serverEcho);

const normalizedUser = normaliseEchoText_Current(userInput);
const normalizedEcho_Current = normaliseEchoText_Current(serverEcho);
const normalizedEcho_Proposed = normaliseEchoText_Proposed(serverEcho);

console.log("\n--- Current Logic ---");
console.log("Normalized User:", normalizedUser);
console.log("Normalized Echo:", normalizedEcho_Current);
console.log("Match?", normalizedUser === normalizedEcho_Current);

console.log("\n--- Proposed Logic ---");
console.log("Normalized User:", normalizedUser); // Should be same
console.log("Normalized Echo:", normalizedEcho_Proposed);
console.log("Match?", normalizedUser === normalizedEcho_Proposed);
