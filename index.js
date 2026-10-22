import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { config } from './config.js';
import { loadOwners, handleMessage, loadBannedSticker } from './handler.js';

const logger = pino({ level: 'silent' });
let reconnecting = false;

function showTerminalUI() {
  console.clear();
  const banner = `\x1b[32m
  ____        _
 | __ )  ___ | |_
 |  _ \\ / _ \\| __|
 | |_) | (_) | ||___
 |____/ \\___/ \\__|
 \x1b[0m`;

  console.log(banner);
  console.log(`\x1b[36m[>] Created By : nomane\x1b[0m`);
  console.log(`\x1b[36m[>] Version    : 1.2.1\x1b[0m\n`);
  console.log(`\x1b[32m[+] Starting Bot Server...\x1b[0m`);
  console.log(`\x1b[32m[+] Loading Configuration...\x1b[0m`);
}

async function startBot() {
  showTerminalUI();
  await loadOwners();
  await loadBannedSticker();

  const { state, saveCreds } = await useMultiFileAuthState(config.SESSION_FOLDER);

  const sock = makeWASocket.default({
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ['Bot WhatsApp', 'Chrome', '1.0.0']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n\x1b[33m[!] Scan QR melalui WhatsApp > Perangkat tertaut:\x1b[0m\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      reconnecting = false;
      console.log('\x1b[32m[+] Connected!\x1b[0m');
      console.log('\x1b[32m[+] Waiting for User Interaction...\x1b[0m\n');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        console.log('\x1b[31m[-] Sesi logout. Tautkan perangkat kembali untuk login.\x1b[0m');
        return;
      }
      if (!reconnecting) {
        reconnecting = true;
        console.log('\x1b[33m[!] ಠ⁠︵⁠ಠ Koneksi terputus. Mencoba menyambung kembali...\x1b[0m');
        setTimeout(() => startBot().catch(err => reconnecting = false), 3000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      await handleMessage(sock, msg, logger);
    }
  });
}

startBot().catch(err => console.error('\x1b[31m[-] Bot gagal dijalankan:\x1b[0m', err.message));