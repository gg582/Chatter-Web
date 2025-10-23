'use client';

import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer
} from 'react';
import {
  Message,
  RegisteredUser,
  Room,
  Thread,
  seedRooms,
  seedUsers
} from '../data/mockData';

interface ChatterState {
  rooms: Room[];
  registeredUsers: RegisteredUser[];
  currentUser: RegisteredUser | null;
  currentRoomId: string;
  currentThreadId: string | null;
  activeUsersByRoom: Record<string, string[]>;
}

interface CommandResult {
  ok: boolean;
  error?: string;
}

interface ChatterContextValue {
  state: ChatterState;
  currentRoom: Room | undefined;
  currentThread: Thread | undefined;
  login: (username: string, password: string) => Promise<CommandResult>;
  register: (username: string, password: string, bio?: string) => Promise<CommandResult>;
  logout: () => void;
  selectRoom: (roomId: string) => void;
  selectThread: (threadId: string | null) => void;
  createThread: (title: string, message: string) => Promise<CommandResult>;
  replyToThread: (message: string) => Promise<CommandResult>;
}

const initialState: ChatterState = {
  rooms: seedRooms,
  registeredUsers: seedUsers,
  currentUser: null,
  currentRoomId: seedRooms[0]?.id ?? '',
  currentThreadId: seedRooms[0]?.threads[0]?.id ?? null,
  activeUsersByRoom: {
    lobby: ['admin', 'ada'],
    code: ['ada'],
    retro: ['admin']
  }
};

type Action =
  | { type: 'LOGIN'; user: RegisteredUser }
  | { type: 'LOGOUT' }
  | { type: 'REGISTER'; user: RegisteredUser }
  | { type: 'SELECT_ROOM'; roomId: string }
  | { type: 'SELECT_THREAD'; threadId: string | null }
  | { type: 'CREATE_THREAD'; roomId: string; thread: Thread }
  | { type: 'APPEND_MESSAGE'; roomId: string; threadId: string; message: Message };

const cloneRoom = (room: Room): Room => ({
  ...room,
  threads: room.threads.map((thread) => ({
    ...thread,
    messages: thread.messages.map((message) => ({ ...message }))
  }))
});

const reducer = (state: ChatterState, action: Action): ChatterState => {
  switch (action.type) {
    case 'LOGIN':
      return {
        ...state,
        currentUser: action.user
      };
    case 'LOGOUT':
      return {
        ...state,
        currentUser: null
      };
    case 'REGISTER':
      return {
        ...state,
        registeredUsers: [...state.registeredUsers, action.user],
        currentUser: action.user
      };
    case 'SELECT_ROOM': {
      const nextRoom = state.rooms.find((room) => room.id === action.roomId);
      return {
        ...state,
        currentRoomId: action.roomId,
        currentThreadId: nextRoom?.threads[0]?.id ?? null
      };
    }
    case 'SELECT_THREAD':
      return {
        ...state,
        currentThreadId: action.threadId
      };
    case 'CREATE_THREAD':
      return {
        ...state,
        rooms: state.rooms.map((room) =>
          room.id === action.roomId
            ? {
                ...room,
                threads: [action.thread, ...room.threads]
              }
            : cloneRoom(room)
        ),
        currentThreadId: action.thread.id
      };
    case 'APPEND_MESSAGE':
      return {
        ...state,
        rooms: state.rooms.map((room) => {
          if (room.id !== action.roomId) {
            return cloneRoom(room);
          }

          return {
            ...room,
            threads: room.threads.map((thread) =>
              thread.id === action.threadId
                ? {
                    ...thread,
                    messages: [...thread.messages, action.message]
                  }
                : { ...thread, messages: [...thread.messages] }
            )
          };
        })
      };
    default:
      return state;
  }
};

const ChatterContext = createContext<ChatterContextValue | undefined>(undefined);

const generateId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

interface ProviderProps {
  children: ReactNode;
}

export const ChatterProvider = ({ children }: ProviderProps) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const currentRoom = useMemo(
    () => state.rooms.find((room) => room.id === state.currentRoomId),
    [state.rooms, state.currentRoomId]
  );

  const currentThread = useMemo(() => {
    if (!currentRoom) {
      return undefined;
    }
    return currentRoom.threads.find((thread) => thread.id === state.currentThreadId);
  }, [currentRoom, state.currentThreadId]);

  const login = useCallback(
    async (username: string, password: string): Promise<CommandResult> => {
      const user = state.registeredUsers.find(
        (candidate) => candidate.username === username && candidate.password === password
      );
      if (!user) {
        return { ok: false, error: 'Invalid credentials. Try again or register first.' };
      }

      dispatch({ type: 'LOGIN', user });
      return { ok: true };
    },
    [state.registeredUsers]
  );

  const register = useCallback(
    async (username: string, password: string, bio?: string): Promise<CommandResult> => {
      if (!username.trim() || !password.trim()) {
        return { ok: false, error: 'Provide both a username and password.' };
      }

      const exists = state.registeredUsers.some((candidate) => candidate.username === username);
      if (exists) {
        return { ok: false, error: 'That username is already taken.' };
      }

      const user: RegisteredUser = { username, password, bio };
      dispatch({ type: 'REGISTER', user });
      return { ok: true };
    },
    [state.registeredUsers]
  );

  const logout = useCallback(() => {
    dispatch({ type: 'LOGOUT' });
  }, []);

  const selectRoom = useCallback((roomId: string) => {
    dispatch({ type: 'SELECT_ROOM', roomId });
  }, []);

  const selectThread = useCallback((threadId: string | null) => {
    dispatch({ type: 'SELECT_THREAD', threadId });
  }, []);

  const createThread = useCallback(
    async (title: string, message: string): Promise<CommandResult> => {
      if (!state.currentUser) {
        return { ok: false, error: 'You must be logged in to post.' };
      }

      if (!currentRoom) {
        return { ok: false, error: 'Select a room first.' };
      }

      if (!title.trim() || !message.trim()) {
        return { ok: false, error: 'Both a subject and message body are required.' };
      }

      const now = new Date().toISOString();
      const thread: Thread = {
        id: generateId('thread'),
        title: title.trim(),
        author: state.currentUser.username,
        createdAt: now,
        messages: [
          {
            id: generateId('message'),
            author: state.currentUser.username,
            postedAt: now,
            body: message.trim()
          }
        ]
      };

      dispatch({ type: 'CREATE_THREAD', roomId: currentRoom.id, thread });
      return { ok: true };
    },
    [currentRoom, state.currentUser]
  );

  const replyToThread = useCallback(
    async (message: string): Promise<CommandResult> => {
      if (!state.currentUser) {
        return { ok: false, error: 'Log in to reply.' };
      }

      if (!currentRoom || !currentThread) {
        return { ok: false, error: 'Choose a thread to reply to.' };
      }

      if (!message.trim()) {
        return { ok: false, error: 'Message cannot be empty.' };
      }

      const now = new Date().toISOString();
      const entry: Message = {
        id: generateId('message'),
        author: state.currentUser.username,
        postedAt: now,
        body: message.trim()
      };

      dispatch({
        type: 'APPEND_MESSAGE',
        roomId: currentRoom.id,
        threadId: currentThread.id,
        message: entry
      });

      return { ok: true };
    },
    [currentRoom, currentThread, state.currentUser]
  );

  const value = useMemo<ChatterContextValue>(
    () => ({
      state,
      currentRoom,
      currentThread,
      login,
      register,
      logout,
      selectRoom,
      selectThread,
      createThread,
      replyToThread
    }),
    [state, currentRoom, currentThread, login, register, logout, selectRoom, selectThread, createThread, replyToThread]
  );

  return <ChatterContext.Provider value={value}>{children}</ChatterContext.Provider>;
};

export const useChatter = (): ChatterContextValue => {
  const context = useContext(ChatterContext);
  if (!context) {
    throw new Error('useChatter must be used within a ChatterProvider');
  }
  return context;
};
