import fs from 'node:fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { config } from './config.js';
import { 
  getMessageText, getGroupInfo, formatMember, resolvePhoneNumber, 
  normalizeNumber, getSenderIds, isBotAdmin, normalizeJid 
} from './utils.js';

const execPromise = promisify(exec);
let OWNER_NUMBERS = [];
const aiUsage = {};

let BANNED_STICKERS = [];
const BANNED_STICKER_FILE = './banned_sticker.json';

export async function loadBannedSticker(){
  try {
    const data = await fs.readFile(BANNED_STICKER_FILE, 'utf-8');
    BANNED_STICKERS = JSON.parse(data);
  }catch(err){
    BANNED_STICKERS = [];
  }
}

async function saveBannedStickers(){
  await fs.writeFile(BANNED_STICKER_FILE, JSON.stringify(BANNED_STICKERS, null, 2), 'utf-8');
}

export async function loadOwners() {
  const main = normalizeNumber(config.MAIN_OWNER);
  try {
    const data = await fs.readFile(config.OWNER_FILE, 'utf8');
    OWNER_NUMBERS = [main, ...JSON.parse(data).map(normalizeNumber).filter(n => n.length >= 8)];
  } catch (err) {
    OWNER_NUMBERS = [main];
  }
  OWNER_NUMBERS = [...new Set(OWNER_NUMBERS)];
  await saveOwners();
}

async function saveOwners() {
  const main = normalizeNumber(config.MAIN_OWNER);
  OWNER_NUMBERS = [...new Set([main, ...OWNER_NUMBERS.map(normalizeNumber).filter(n => n.length >= 8)])];
  await fs.writeFile(config.OWNER_FILE, JSON.stringify(OWNER_NUMBERS, null, 2), 'utf8');
}

async function isOwner(sock, msg) {
  for (const jid of getSenderIds(msg)) {
    const number = await resolvePhoneNumber(sock, jid);
    if (number && OWNER_NUMBERS.includes(number)) return true;
  }
  return false;
}

async function isMainOwner(sock, msg) {
  const main = normalizeNumber(config.MAIN_OWNER);
  for (const jid of getSenderIds(msg)) {
    const number = await resolvePhoneNumber(sock, jid);
    if (number && number === main) return true;
  }
  return false;
}

export async function deleteRepliedMessage(sock, msg, groupJid) {
  const context = msg.message?.extendedTextMessage?.contextInfo;
  if (!context?.stanzaId) {
    await sock.sendMessage(groupJid, { text: 'Balas pesan yang ingin dihapus, lalu ketik !hapus atau !del.' }, { quoted: msg });
    return;
  }

  const metadata = await getGroupInfo(sock, groupJid);
  if (!metadata || !(await isBotAdmin(sock, metadata))) {
    await sock.sendMessage(groupJid, { text: 'Bot harus menjadi admin grup untuk menghapus pesan.' });
    return;
  }

  const key = { remoteJid: groupJid, id: context.stanzaId, fromMe: Boolean(context.fromMe) };
  if (context.participant) {
    key.participant = context.participant;
  } else if (context.participantAlt) {
    key.participant = context.participantAlt;
  }

  try {
    await sock.sendMessage(groupJid, { delete: key });
  } catch (err) {
    await sock.sendMessage(groupJid, { text: 'Gagal menghapus pesan. Periksa izin admin dan identitas pesan.' });
  }
}

async function addMember(sock, msg, groupJid, text) {
  const rawNumber = text.trim().split(/\s+/)[1];
  const number = normalizeNumber(rawNumber ?? '');

  if (!number || number.length < 8) {
    await sock.sendMessage(groupJid, { text: 'Format: !add 628xxxxxxxxxx' }, { quoted: msg });
    return;
  }

  const metadata = await getGroupInfo(sock, groupJid);
  if (!metadata || !(await isBotAdmin(sock, metadata))) {
    await sock.sendMessage(groupJid, { text: 'Bot harus menjadi admin grup untuk menambahkan anggota.' });
    return;
  }

  try {
    const result = await sock.groupParticipantsUpdate(groupJid, [`${number}@s.whatsapp.net`], 'add');
    const status = String(result?.[0]?.status ?? '');
    if (status === '200') {
      await sock.sendMessage(groupJid, { text: `✅ Berhasil menambahkan ${number}.` });
    } else {
      await sock.sendMessage(groupJid, { text: `Permintaan ditunda/ditolak oleh WhatsApp dengan status ${status}.` });
    }
  } catch (err) {
    await sock.sendMessage(groupJid, { text: 'Gagal menambahkan anggota.' });
  }
}

async function kickMember(sock, msg, groupJid) {
  const context = msg.message?.extendedTextMessage?.contextInfo;
  const mentioned = context?.mentionedJid ?? [];

  if (!mentioned.length) {
    await sock.sendMessage(groupJid, { text: 'Tag anggota yang ingin dikeluarkan. Contoh: !kick @anggota' }, { quoted: msg });
    return;
  }

  const metadata = await getGroupInfo(sock, groupJid);
  if (!metadata || !(await isBotAdmin(sock, metadata))) {
    await sock.sendMessage(groupJid, { text: 'Bot harus menjadi admin grup untuk mengeluarkan anggota.' });
    return;
  }

  const botIds = [sock.user?.id, sock.user?.lid].filter(Boolean).map(normalizeJid);
  const targets = mentioned.map(normalizeJid).filter(id => !botIds.includes(id));

  if (!targets.length) {
    await sock.sendMessage(groupJid, { text: 'Target tidak valid atau merupakan akun bot sendiri.' });
    return;
  }

  try {
    const results = await sock.groupParticipantsUpdate(groupJid, targets, 'remove');
    const succeeded = results?.filter(r => String(r.status) === '200').length ?? 0;
    await sock.sendMessage(groupJid, { text: succeeded > 0 ? `Berhasil mengeluarkan ${succeeded} anggota.` : 'Gagal mengeluarkan anggota.' });
  } catch (err) {
    await sock.sendMessage(groupJid, { text: 'Gagal mengeluarkan anggota. Periksa izin admin bot.' });
  }

  const ownerIds = [sock.owner?.id, sock.owner?.lid].filter(Booleann).map(normalizeJid);
  const target = mentioned.map(normalizeJid).filter(id=> !ownerIds.includes(id));

  if(!target.length){
    await sock.sendMessage(groupJid, {text : 'owner utama tidak bisa di hapus'});
    return;
  }
}

async function manageOwners(sock, msg, groupJid, text, command) {
  if (!(await isMainOwner(sock, msg))) {
    await sock.sendMessage(groupJid, { text: '❌ Hanya owner utama yang boleh mengelola daftar owner.' }, { quoted: msg });
    return;
  }

  if (command === `${config.PREFIX}ownerlist`) {
    const main = normalizeNumber(config.MAIN_OWNER);
    const list = OWNER_NUMBERS.map((number, index) => {
      return `${index + 1}. ${number}${normalizeNumber(number) === main ? ' (Owner Utama)' : ''}`;
    }).join('\n');
    await sock.sendMessage(groupJid, { text: `👑 DAFTAR OWNER\n\n${list || 'Belum ada owner.'}` }, { quoted: msg });
    return;
  }

  const rawNumber = text.trim().split(/\s+/)[1];
  const number = normalizeNumber(rawNumber ?? '');
  const main = normalizeNumber(config.MAIN_OWNER);

  if (!number || number.length < 8) {
    await sock.sendMessage(groupJid, { text: `Format:\n${config.PREFIX}owneradd 628xxx\n${config.PREFIX}ownerdel 628xxx\n${config.PREFIX}ownerlist` }, { quoted: msg });
    return;
  }

  if (command === `${config.PREFIX}owneradd`) {
    if (OWNER_NUMBERS.includes(number)) return sock.sendMessage(groupJid, { text: 'Nomor sudah terdaftar.' }, { quoted: msg });
    OWNER_NUMBERS.push(number);
    await saveOwners();
    await sock.sendMessage(groupJid, { text: `✅ ${number} berhasil ditambahkan.` }, { quoted: msg });
  } 
  else if (command === `${config.PREFIX}ownerdel`) {
    if (number === main) return sock.sendMessage(groupJid, { text: '❌ Owner utama tidak bisa dihapus.' }, { quoted: msg });
    if (!OWNER_NUMBERS.includes(number)) return sock.sendMessage(groupJid, { text: 'Nomor tidak ditemukan.' }, { quoted: msg });
    OWNER_NUMBERS = OWNER_NUMBERS.filter(n => n !== number);
    await saveOwners();
    await sock.sendMessage(groupJid, { text: `✅ ${number} telah dihapus dari daftar owner.` }, { quoted: msg });
  }
}

export async function handleMessage(sock, msg, logger) {
  if (!msg.message || msg.key.fromMe) return;
  const groupJid = msg.key.remoteJid;
  if (!groupJid?.endsWith('@g.us')) return;
  const isSticker = msg.message?.stickerMessage;
  if(isSticker){
    const stickerHash = msg.message.stickerMessage.fileSha256.toString('base64');
    if(BANNED_STICKERS.includes(stickerHash)){
      const metadata = await getGroupInfo(sock, groupJid);
      if (metadata && (await isBotAdmin(sock, metadata))){
        try{
          await sock.sendMessage(groupJid, {delete : msg.key});

          const sender = msg.key.Participant || msg.key.participantAlt;
          await sock.sendMessage(groupJid, {
            text : `⚠️ @${sender.split('@')[0]}, stiker tersebut telah diblacklist dari grup!`,
            mentions: [sender]
          });
        }catch(err){
          console.error('Gagal menghapus stiker blacklist:', err.message);
        }
      }
      return;
    }
  }

  const text = getMessageText(msg);
  if (!text.startsWith(config.PREFIX)) return;

  const command = text.split(/\s+/)[0].toLowerCase();

  if (command === `${config.PREFIX}menu`) {
    const metadata = await getGroupInfo(sock, groupJid);
    const members = metadata ? metadata.participants.map(formatMember).join('\n') : '';
    const menu = `〔 🤖 BOT WHATSAPP 〕\n\n👥 DAFTAR ANGGOTA\n${members || 'Belum ada anggota.'}\n
    📌 PERINTAH UMUM\n
    !menu — menampilkan menu
    !aturan — melihat aturan grup
    !aii — tanya AI
    !addstiker — buat stiker
    !pin — sematkan pesan !pin 1/2/3
    !unpin — hapus sematan pesan
    !update — lihat apa yang baru
    !banstiker — blacklist stiker yang di reply\n
    🛡️ PERINTAH OWNER\n
    !hapus / !del — hapus pesan
    !add — tambah anggota
    !kick — keluarkan anggota
    !ownerlist — daftar owner
    !owneradd — tambah owner
    !ownerdel — hapus owner`;
    await sock.sendMessage(groupJid, { text: menu });
  }
  else if (command === `${config.PREFIX}update`) {
    await sock.sendMessage(groupJid, { text: `
    update bisa kalian cek langsung lewat GitHub / hubungi pemilik Bot !\n
    https://github.com/thev0idb/whatsapp-bot` });
  }
  else if (command === `${config.PREFIX}aturan`) {
    await sock.sendMessage(groupJid, { text: '📜 ATURAN GRUP\n\n' + config.GROUP_RULES.join('\n') });
  }
  else if (command === `${config.PREFIX}addstiker`) {
    const isImage = msg.message?.imageMessage;
    const isQuotedImage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
    if (!isImage && !isQuotedImage) return sock.sendMessage(groupJid, { text: 'Kirim gambar dengan caption !addstiker' });
    
    try {
      const targetMsg = isImage ? msg : { key: msg.key, message: msg.message.extendedTextMessage.contextInfo.quotedMessage };
      const buffer = await downloadMediaMessage(targetMsg, 'buffer', {}, { logger });
      const tmpIn = `./temp_${Date.now()}.jpg`;
      const tmpOut = `./temp_${Date.now()}.webp`;
      
      await fs.writeFile(tmpIn, buffer);
      await execPromise(`ffmpeg -i ${tmpIn} -vcodec libwebp -filter:v fps=fps=20 -lossless 1 -loop 0 -preset default -an -vsync 0 -s 512:512 ${tmpOut}`);
      const stickerBuffer = await fs.readFile(tmpOut);
      
      await sock.sendMessage(groupJid, { sticker: stickerBuffer }, { quoted: msg });
      await fs.unlink(tmpIn); await fs.unlink(tmpOut);
    } catch (err) {
      await sock.sendMessage(groupJid, { text: 'Gagal membuat stiker.' });
    }
  }
  else if (command === `${config.PREFIX}aii`) {
    const senderIds = getSenderIds(msg);
    const sender = senderIds[0] || msg.key.remoteJid;
    const userNum = await resolvePhoneNumber(sock, sender) || normalizeNumber(sender);

    if (!aiUsage[userNum]) aiUsage[userNum] = 0;
    if (aiUsage[userNum] >= config.MAX_AI_USAGE) {
      await sock.sendMessage(groupJid, { text: `❌ Batas penggunaan AI kamu (${config.MAX_AI_USAGE} kali) sudah habis.` }, { quoted: msg });
      return;
    }

    const query = text.slice(command.length).trim();
    if (!query) {
      await sock.sendMessage(groupJid, { text: 'Masukkan pertanyaan. Contoh: !aii apa itu javascript?' }, { quoted: msg });
      return;
    }

    try {
      const apiKey = '';
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          messages: [{ 
            role: 'user', 
            content: query }]
        })
      });
      const data = await response.json();
      const aiAnswer = data.choices?.[0]?.message?.content || 'Tidak ada respon dari AI (⁠─⁠.─⁠||⁠)';

      aiUsage[userNum] += 1;
      await sock.sendMessage(groupJid, { text: `${aiAnswer}\n\n*⚡ Sisa penggunaan AI: ${config.MAX_AI_USAGE - aiUsage[userNum]}/${config.MAX_AI_USAGE}*` }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(groupJid, { text: 'Terjadi kesalahan saat menghubungkan ke server AI.' }, { quoted: msg });
    }
  }
  else if (command === `${config.PREFIX}pin`) {
    const context = msg.message?.extendedTextMessage?.contextInfo;
    const args = text.split(/\s+/)[1];

    if (!context?.stanzaId) return sock.sendMessage(groupJid, { text: 'Balas pesan yang ingin disematkan, lalu ketik:\n\n*!pin 1* (untuk 24 jam)\n*!pin 2* (untuk 7 hari)\n*!pin 3* (untuk 30 hari)' }, { quoted: msg });
    
    const metadata = await getGroupInfo(sock, groupJid);
    if (!metadata || !(await isBotAdmin(sock, metadata))) return sock.sendMessage(groupJid, { text: '❌ Bot harus menjadi admin.' }, { quoted: msg });

    let duration = args === '1' ? 86400 : args === '2' ? 604800 : args === '3' ? 2592000 : 0;
    if (!duration) return sock.sendMessage(groupJid, { text: '❌ Pilihan waktu tidak valid.\nContoh: *!pin 2*\n1 = 24 Jam | 2 = 7 Hari | 3 = 30 Hari' }, { quoted: msg });

    const key = { remoteJid: groupJid, id: context.stanzaId, fromMe: Boolean(context.fromMe), participant: context.participant || context.participantAlt };
    try {
      await sock.sendMessage(groupJid, { pin: key, type: 1, time: duration });
      await sock.sendMessage(groupJid, { text: '✅ Pesan berhasil disematkan!' }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(groupJid, { text: '❌ Gagal menyematkan pesan.' }, { quoted: msg });
    }
  }
  else if (command === `${config.PREFIX}unpin`) {
    const context = msg.message?.extendedTextMessage?.contextInfo;
    if (!context?.stanzaId) return sock.sendMessage(groupJid, { text: 'Balas pesan yang ingin dilepas sematannya, lalu ketik *!unpin*' }, { quoted: msg });

    const metadata = await getGroupInfo(sock, groupJid);
    if (!metadata || !(await isBotAdmin(sock, metadata))) return sock.sendMessage(groupJid, { text: '❌ Bot harus menjadi admin.' }, { quoted: msg });

    const key = { remoteJid: groupJid, id: context.stanzaId, fromMe: Boolean(context.fromMe), participant: context.participant || context.participantAlt };
    try {
      await sock.sendMessage(groupJid, { pin: key, type: 2 });
      await sock.sendMessage(groupJid, { text: '✅ Sematan dilepas!' }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(groupJid, { text: '❌ Gagal melepas sematan.' }, { quoted: msg });
    }
  }
  else if (command === `${config.PREFIX}banstiker`) {
    const metadata = await getGroupInfo(sock, groupJid);
    const isAdmin = metadata?.participants.find(p => (p.id || p.jid) === (msg.key.participant || msg.key.remoteJid))?.admin;
    
    if (!isAdmin && !(await isOwner(sock, msg))) {
      return sock.sendMessage(groupJid, { text: '❌ Hanya admin/owner yang bisa blacklist stiker.' }, { quoted: msg });
    }

    const context = msg.message?.extendedTextMessage?.contextInfo;
    const quotedSticker = context?.quotedMessage?.stickerMessage;

    if (!quotedSticker) {
      return sock.sendMessage(groupJid, { text: 'Balas stiker yang ingin diblacklist lalu ketik !banstiker' }, { quoted: msg });
    }

    const hash = quotedSticker.fileSha256.toString('base64');

    if (BANNED_STICKERS.includes(hash)) {
      return sock.sendMessage(groupJid, { text: '⚠️ Stiker ini sudah ada di daftar blacklist.' }, { quoted: msg });
    }

    BANNED_STICKERS.push(hash);
    await saveBannedStickers();
  }

  const ownerManagementCommands = [`${config.PREFIX}owneradd`, `${config.PREFIX}ownerdel`, `${config.PREFIX}ownerlist`];
  if (ownerManagementCommands.includes(command)) {
    await manageOwners(sock, msg, groupJid, text, command);
    return;
  }

  const ownerCommands = [`${config.PREFIX}hapus`, `${config.PREFIX}del`, `${config.PREFIX}add`, `${config.PREFIX}kick`, `${config.PREFIX}banstiker`];
  if (ownerCommands.includes(command)) {
    if (!(await isOwner(sock, msg))) {
      await sock.sendMessage(groupJid, { text: '┐⁠(⁠ ⁠˘⁠_⁠˘⁠)⁠┌ Kamu bukan pemilik bot' }, { quoted: msg });
      return;
    }
    
    if (command === `${config.PREFIX}hapus` || command === `${config.PREFIX}del`) {
      await deleteRepliedMessage(sock, msg, groupJid);
    } else if (command === `${config.PREFIX}add`) {
      await addMember(sock, msg, groupJid, text);
    } else if (command === `${config.PREFIX}kick`) {
      await kickMember(sock, msg, groupJid);
    } else if (command === `${config.PREFIX}banstiekr`){
      await saveBannedStickers(sock, msg, groupJid, text);
    }
  }
}