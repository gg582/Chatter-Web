export interface CliCommandMapping {
  command: string;
  description: string;
  uiPath: string;
}

export const cliCommandMappings: CliCommandMapping[] = [
  {
    command: '/register <username> <password>',
    description: 'Create a new account for the BBS.',
    uiPath: 'Use the Sign up tab in the Session panel.'
  },
  {
    command: '/login <username> <password>',
    description: 'Authenticate an existing user.',
    uiPath: 'Open the Session panel and submit the Log in form.'
  },
  {
    command: '/logout',
    description: 'Leave the active BBS session.',
    uiPath: 'Press the Log out button in the Session panel.'
  },
  {
    command: '/rooms',
    description: 'List the available rooms.',
    uiPath: 'Room list in the navigation sidebar.'
  },
  {
    command: '/enter <room>',
    description: 'Move into a room to browse its threads.',
    uiPath: 'Click on a room from the sidebar to enter it.'
  },
  {
    command: '/threads',
    description: 'Show threads for the current room.',
    uiPath: 'Central thread column updates after selecting a room.'
  },
  {
    command: '/open <thread>',
    description: 'Read the posts in a thread.',
    uiPath: 'Select a thread to view its messages on the right.'
  },
  {
    command: '/post',
    description: 'Start a brand new thread within the room.',
    uiPath: 'Use the “New thread” form under the thread list.'
  },
  {
    command: '/reply',
    description: 'Respond inside the current thread.',
    uiPath: 'Use the composer under the message view.'
  },
  {
    command: '/whoami',
    description: 'Show your user information.',
    uiPath: 'Session panel displays the signed in account and bio.'
  },
  {
    command: '/users',
    description: 'List active users in the room.',
    uiPath: 'Participants list in the room header.'
  }
];
