export interface Message {
  id: string;
  author: string;
  postedAt: string;
  body: string;
}

export interface Thread {
  id: string;
  title: string;
  author: string;
  createdAt: string;
  messages: Message[];
}

export interface Room {
  id: string;
  name: string;
  topic: string;
  threads: Thread[];
}

export interface RegisteredUser {
  username: string;
  password: string;
  bio?: string;
}

export const seedUsers: RegisteredUser[] = [
  {
    username: 'admin',
    password: 'admin',
    bio: 'Keeper of the BBS. Try /help for tips.'
  },
  {
    username: 'ada',
    password: 'lovelace',
    bio: 'Resident reverse engineer and math poet.'
  }
];

export const seedRooms: Room[] = [
  {
    id: 'lobby',
    name: 'Lobby',
    topic: 'Announcements and quick chatter for new arrivals.',
    threads: [
      {
        id: 'welcome-thread',
        title: 'Welcome to Chatter!',
        author: 'admin',
        createdAt: '2024-03-01T10:00:00.000Z',
        messages: [
          {
            id: 'm1',
            author: 'admin',
            postedAt: '2024-03-01T10:00:00.000Z',
            body: 'Type /rooms to explore or pick a topic from the panel on the left.'
          },
          {
            id: 'm2',
            author: 'ada',
            postedAt: '2024-03-02T12:24:00.000Z',
            body: 'Ping me if you want a tour of the /code room!'
          }
        ]
      }
    ]
  },
  {
    id: 'code',
    name: 'Code Workshop',
    topic: 'Deep dives into shell tricks, compilers, and networked fun.',
    threads: [
      {
        id: 't-c-1',
        title: 'Building a CLI-first BBS',
        author: 'ada',
        createdAt: '2024-03-11T19:00:00.000Z',
        messages: [
          {
            id: 't-c-1-m1',
            author: 'ada',
            postedAt: '2024-03-11T19:00:00.000Z',
            body: 'Share your favourite command aliases for faster moderation.'
          }
        ]
      }
    ]
  },
  {
    id: 'retro',
    name: 'Retro Computing',
    topic: 'Share phreaker stories and ANSI art.',
    threads: []
  }
];
