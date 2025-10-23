import styles from './page.module.css';
import { SessionPanel } from '../components/SessionPanel';
import { RoomNavigator } from '../components/RoomNavigator';
import { ThreadPanel } from '../components/ThreadPanel';
import { MessagePanel } from '../components/MessagePanel';
import { CommandMapping } from '../components/CommandMapping';

export default function HomePage() {
  return (
    <main>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '2.4rem', color: '#f8fafc', letterSpacing: '0.08em' }}>
          Chatter BBS Control Deck
        </h1>
        <p style={{ margin: 0, maxWidth: '720px', fontSize: '1rem', color: 'rgba(226, 232, 240, 0.72)' }}>
          This interface mirrors the ssh <strong>Chatter</strong> command-line experience. Use the panels below to
          execute the same actions that the CLI offers—without remembering each slash command.
        </p>
      </div>

      <div className={styles.wrapper}>
        <div className={styles.column}>
          <RoomNavigator />
        </div>
        <div className={styles.column}>
          <ThreadPanel />
          <CommandMapping />
        </div>
        <div className={styles.column}>
          <MessagePanel />
          <SessionPanel />
        </div>
      </div>
    </main>
  );
}
