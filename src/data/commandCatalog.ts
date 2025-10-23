export interface CommandMapping {
  command: string;
  description: string;
  ui: string;
}

export interface CommandGroup {
  title: string;
  summary: string;
  commands: CommandMapping[];
}

export const commandGroups: CommandGroup[] = [
  {
    title: 'Orientation & presence',
    summary: 'Get your bearings, read the MOTD, and see who is online.',
    commands: [
      {
        command: '/help',
        description: 'Show the CLI help output.',
        ui: 'Session card → “Help overview” link.'
      },
      {
        command: '/motd',
        description: 'View the message of the day.',
        ui: 'MOTD card at the top of the chat column.'
      },
      {
        command: '/exit',
        description: 'Leave the SSH session.',
        ui: 'Session card → Log out button.'
      },
      {
        command: '/users',
        description: 'Announce the number of connected users.',
        ui: 'Identity → Directory tools → “Connected now” counter.'
      },
      {
        command: '/connected',
        description: 'Privately list everyone connected.',
        ui: 'Identity → Directory tools → “Connected roster” list.'
      },
      {
        command: '/search <text>',
        description: 'Search for users whose name matches the text.',
        ui: 'Identity → Directory tools → User search field.'
      },
      {
        command: 'Up/Down arrows',
        description: 'Scroll recent chat history.',
        ui: 'Chat feed column → Scroll the transcript.'
      }
    ]
  },
  {
    title: 'Identity & status',
    summary: 'Profile customisation and directory lookups.',
    commands: [
      {
        command: '/nick <name>',
        description: 'Change your display name.',
        ui: 'Identity → Profile → Nickname form.'
      },
      {
        command: '/status <message|clear>',
        description: 'Set or clear a status message.',
        ui: 'Identity → Profile → Status editor.'
      },
      {
        command: '/showstatus <username>',
        description: 'View someone else\'s status.',
        ui: 'Identity → Directory tools → Status lookup.'
      },
      {
        command: '/os <name>',
        description: 'Record your operating system.',
        ui: 'Identity → Profile → Operating system selector.'
      },
      {
        command: '/getos <username>',
        description: 'Look up a user\'s operating system.',
        ui: 'Identity → Directory tools → OS lookup.'
      },
      {
        command: '/birthday YYYY-MM-DD',
        description: 'Register your birthday.',
        ui: 'Identity → Profile → Birthday form.'
      },
      {
        command: '/soulmate',
        description: 'List users sharing your birthday.',
        ui: 'Identity → Directory tools → Birthday matches.'
      },
      {
        command: '/pair',
        description: 'List users sharing your recorded OS.',
        ui: 'Identity → Directory tools → OS matches.'
      }
    ]
  },
  {
    title: 'Chat & messaging',
    summary: 'Room-wide chat, replies, reactions, and private messages.',
    commands: [
      {
        command: 'Regular messages',
        description: 'Post to the shared room without a slash command.',
        ui: 'Chat feed → Message composer.'
      },
      {
        command: '/reply <message-id|r<reply-id>> <text>',
        description: 'Reply to a specific message or reply.',
        ui: 'Chat feed → Reply dropdown in the composer.'
      },
      {
        command: '/chat <message-id>',
        description: 'View a past message by id.',
        ui: 'Messaging → History tools → Message lookup.'
      },
      {
        command: '/pm <username> <message>',
        description: 'Send a private message to a user.',
        ui: 'Messaging → Private messages → Compose form.'
      },
      {
        command: '/good|/sad|/cool|/angry|/checked|/love|/wtf <id>',
        description: 'React to a message.',
        ui: 'Messaging → Reactions → Reaction picker.'
      },
      {
        command: '/delete-msg <id|start-end>',
        description: 'Remove chat history messages.',
        ui: 'Messaging → History tools → Delete messages.'
      }
    ]
  },
  {
    title: 'Media & attachments',
    summary: 'Share links and files that mirror CLI upload helpers.',
    commands: [
      {
        command: '/image <url> [caption]',
        description: 'Share an image link.',
        ui: 'Media → Add attachment (image tab).'
      },
      {
        command: '/video <url> [caption]',
        description: 'Share a video clip.',
        ui: 'Media → Add attachment (video tab).'
      },
      {
        command: '/audio <url> [caption]',
        description: 'Share an audio clip.',
        ui: 'Media → Add attachment (audio tab).'
      },
      {
        command: '/files <url> [caption]',
        description: 'Share a downloadable file.',
        ui: 'Media → Add attachment (files tab).'
      },
      {
        command: '/asciiart',
        description: 'Open the ASCII art composer.',
        ui: 'Media → ASCII art studio.'
      }
    ]
  },
  {
    title: 'Appearance & translation',
    summary: 'Match CLI theming and translation helpers.',
    commands: [
      {
        command: '/color (text;highlight[;bold])',
        description: 'Style your handle colours.',
        ui: 'Appearance → Handle colour controls.'
      },
      {
        command: '/systemcolor (fg;background[;highlight][;bold])',
        description: 'Style the interface theme.',
        ui: 'Appearance → System palette picker.'
      },
      {
        command: '/palette <name>',
        description: 'Apply a predefined palette.',
        ui: 'Appearance → Palette presets.'
      },
      {
        command: '/set-trans-lang <language|off>',
        description: 'Choose translation language for incoming chat.',
        ui: 'Appearance → Translation settings.'
      },
      {
        command: '/set-target-lang <language|off>',
        description: 'Choose the language for outgoing messages.',
        ui: 'Appearance → Translation settings.'
      },
      {
        command: '/translate <on|off>',
        description: 'Toggle automatic translation.',
        ui: 'Appearance → Translation toggle.'
      },
      {
        command: '/translate-scope <chat|chat-nohistory|all>',
        description: 'Limit how translation is applied.',
        ui: 'Appearance → Translation scope selector.'
      },
      {
        command: '/chat-spacing <0-5>',
        description: 'Reserve blank lines before translated captions.',
        ui: 'Appearance → Caption spacing slider.'
      }
    ]
  },
  {
    title: 'Assistants & fun',
    summary: 'Games, AI helpers, and daily curiosities.',
    commands: [
      {
        command: '/game <tetris|liargame>',
        description: 'Start a terminal minigame.',
        ui: 'Assistants → Games launcher.'
      },
      {
        command: '/suspend!',
        description: 'Suspend the active game.',
        ui: 'Assistants → Games launcher → Suspend control.'
      },
      {
        command: '/gemini <on|off>',
        description: 'Toggle the Gemini provider (operator only).',
        ui: 'Assistants → Gemini toggle.'
      },
      {
        command: '/gemini-unfreeze',
        description: 'Clear the Gemini cooldown.',
        ui: 'Assistants → Gemini cooldown reset.'
      },
      {
        command: '/eliza <on|off>',
        description: 'Toggle the Eliza moderator persona.',
        ui: 'Assistants → Eliza toggle.'
      },
      {
        command: '/eliza-chat <message>',
        description: 'Chat with Eliza using shared memories.',
        ui: 'Assistants → Eliza chat console.'
      },
      {
        command: '/today',
        description: 'Discover today\'s function.',
        ui: 'Assistants → Daily curiosities.'
      },
      {
        command: '/date <timezone>',
        description: 'View the server time in another timezone.',
        ui: 'Assistants → Timezone clock.'
      },
      {
        command: '/weather <region> <city>',
        description: 'Show the weather for a location.',
        ui: 'Assistants → Weather lookup.'
      }
    ]
  },
  {
    title: 'Polls & moderation',
    summary: 'Keep order and run community votes.',
    commands: [
      {
        command: '/grant <ip>',
        description: 'Grant operator access to an IP.',
        ui: 'Moderation → Operator access list.'
      },
      {
        command: '/revoke <ip>',
        description: 'Revoke operator access.',
        ui: 'Moderation → Operator access list.'
      },
      {
        command: '/ban <username>',
        description: 'Ban a user.',
        ui: 'Moderation → Ban manager.'
      },
      {
        command: '/banlist',
        description: 'List banned users.',
        ui: 'Moderation → Ban manager.'
      },
      {
        command: '/pardon <user|ip>',
        description: 'Remove a ban (operator only).',
        ui: 'Moderation → Ban manager.'
      },
      {
        command: '/block <user|ip>',
        description: 'Hide messages from a user or IP locally.',
        ui: 'Moderation → Block list.'
      },
      {
        command: '/unblock <target|all>',
        description: 'Clear a block entry.',
        ui: 'Moderation → Block list.'
      },
      {
        command: '/poke <username>',
        description: 'Send a bell to call a user.',
        ui: 'Moderation → Attention tools.'
      },
      {
        command: '/kick <username>',
        description: 'Disconnect a user.',
        ui: 'Moderation → Attention tools → Kick button.'
      },
      {
        command: '/poll <question>|<option...>',
        description: 'Start or inspect a poll.',
        ui: 'Moderation → Poll builder.'
      },
      {
        command: '/vote <label> <question>|<option...>',
        description: 'Create or update a multiple-choice poll.',
        ui: 'Moderation → Poll builder (multiple choice).'
      },
      {
        command: '/vote-single <label> <question>|<option...>',
        description: 'Create or update a single-choice poll.',
        ui: 'Moderation → Poll builder (single choice).'
      },
      {
        command: '/elect <label> <choice>',
        description: 'Vote in a named poll.',
        ui: 'Moderation → Vote controls.'
      },
      {
        command: '/1 .. /5',
        description: 'Vote for numeric poll options.',
        ui: 'Moderation → Quick vote buttons.'
      },
      {
        command: '/delete-msg <id|start-end>',
        description: 'Remove chat history messages.',
        ui: 'Messaging → History tools → Delete messages.'
      }
    ]
  },
  {
    title: 'Bulletin board & feeds',
    summary: 'The long-form BBS and saved RSS feeds.',
    commands: [
      {
        command: '/bbs [list|read|post|comment|regen|delete]',
        description: 'Interact with the bulletin board.',
        ui: 'BBS & Feeds → Bulletin board cards.'
      },
      {
        command: '/rss list',
        description: 'List saved RSS feeds.',
        ui: 'BBS & Feeds → Saved feeds table.'
      },
      {
        command: '/rss read <tag>',
        description: 'Open a saved feed.',
        ui: 'BBS & Feeds → Feed reader.'
      },
      {
        command: '/rss add <url> <tag>',
        description: 'Register a new feed.',
        ui: 'BBS & Feeds → Feed registration form.'
      }
    ]
  }
];
