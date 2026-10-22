import { jidNormalizedUser } from '@whiskeysockets/baileys';
import fs from 'node:fs/promises';
import { config } from './config.js';

export function normalizeNumber(value = '') {
  return String(value).replace(/\D/g, '');
}

export function normalizeJid(jid) {
  if (!jid) return '';
  try { return jidNormalizedUser(jid); } catch { return jid; }
}

export function getMessageText(msg) {
  const m = msg.message;
  return (
    m?.conversation ??
    m?.extendedTextMessage?.text ??
    m?.imageMessage?.caption ??
    m?.videoMessage?.caption ??
    m?.documentMessage?.caption ??
    m?.buttonsResponseMessage?.selectedButtonId ??
    m?.listResponseMessage?.singleSelectReply?.selectedRowId ??
    m?.templateButtonReplyMessage?.selectedId ??
    ''
  ).trim();
}

export function getSenderIds(msg) {
  return [msg.key?.participant, msg.key?.participantAlt].filter(Boolean).map(normalizeJid);
}

export function isPhoneJid(jid) {
  return typeof jid === 'string' && jid.endsWith('@s.whatsapp.net');
}

export async function getGroupInfo(sock, groupJid) {
  try { return await sock.groupMetadata(groupJid); } 
  catch (err) { return null; }
}

export function participantIds(participant) {
    return [
      participant?.id,
      participant?.jid,
      participant?.lid,
      participant?.phoneNumber
    ]
      .filter(Boolean)
      .map(normalizeJid);
  }
  
  export function isAdminParticipant(participant) {
    return Boolean(participant?.admin);
  }
  
  export async function isBotAdmin(sock, metadata) {
    if (!metadata) return false;
  
    const botIds = [
      sock.user?.id,
      sock.user?.lid
    ]
      .filter(Boolean)
      .map(normalizeJid);
  
    const botParticipant = metadata.participants.find(p =>
      participantIds(p).some(id => botIds.includes(id))
    );
  
    return isAdminParticipant(botParticipant);
  }

export function formatMember(participant, index) {
  const phoneJid = [participant?.phoneNumber, isPhoneJid(participant?.id) ? participant.id : null, isPhoneJid(participant?.jid) ? participant.jid : null].find(Boolean);
  const number = phoneJid ? normalizeNumber(phoneJid.split('@')[0]) : 'Nomor tidak tersedia';
  return `${index + 1}. ${number}${participant?.admin ? ' (Admin)' : ''}`;
}

export async function resolvePhoneNumber(sock, jid) {
  if (!jid) return null;
  const normalized = normalizeJid(jid);
  if (isPhoneJid(normalized)) return normalizeNumber(normalized.split('@')[0]);
  if (!normalized.endsWith('@lid')) return null;
  try {
    const pn = await sock.signalRepository?.lidMapping?.getPNForLID?.(normalized);
    if (pn && isPhoneJid(pn)) return normalizeNumber(pn.split('@')[0]);
  } catch (err) {}
  return null;
}