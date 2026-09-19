require('dotenv').config();

const fs = require('fs');
const path = require('path');

// Redirige le stockage temporaire (évite ENOSPC sur certains hébergeurs)
const customTemp = path.join(process.cwd(), 'temp');
if (!fs.existsSync(customTemp)) fs.mkdirSync(customTemp, { recursive: true });
process.env.TMPDIR = customTemp;
process.env.TEMP = customTemp;
process.env.TMP = customTemp;

const settings = require('./settings');
const { isSudo } = require('./lib/index');
const isOwnerOrSudo = require('./lib/isOwner');

// ── Commandes IB-SACKO (uniquement celles-ci) ──
const menuCommand = require('./commands/menu');
const pingCommand = require('./commands/ping');
const ownerCommand = require('./commands/owner');
const pairCommand = require('./commands/pair');
const { handleAntideleteCommand, handleMessageRevocation, storeMessage } = require('./commands/antidelete');
const hummCommand = require('./commands/humm');
const waouhCommand = require('./commands/waouh');

global.botname = settings.botName;
global.channelLink = 'https://whatsapp.com/channel/0029VbDCmVWISTkNEy1D3p3H';

const MODE_FILE = path.join(__dirname, 'data', 'messageCount.json');

function readIsPublic() {
    try {
        const d = JSON.parse(fs.readFileSync(MODE_FILE));
        return typeof d.isPublic === 'boolean' ? d.isPublic : true;
    } catch { return true; }
}
function writeIsPublic(val) {
    let d = {};
    try { d = JSON.parse(fs.readFileSync(MODE_FILE)); } catch {}
    d.isPublic = val;
    fs.mkdirSync(path.dirname(MODE_FILE), { recursive: true });
    fs.writeFileSync(MODE_FILE, JSON.stringify(d, null, 2));
}

async function modeCommand(sock, chatId, message, action) {
    if (!action) {
        const cur = readIsPublic() ? 'public' : 'privé';
        return sock.sendMessage(chatId, {
            text: `Mode actuel : *${cur}*\n\nUsage : mode public / mode privé`
        }, { quoted: message });
    }
    if (action !== 'public' && action !== 'privé' && action !== 'private') {
        return sock.sendMessage(chatId, {
            text: 'Usage : mode public / mode privé'
        }, { quoted: message });
    }
    writeIsPublic(action === 'public');
    await sock.sendMessage(chatId, { text: `✅ Bot maintenant en mode *${action === 'public' ? 'public' : 'privé'}*` }, { quoted: message });
}

async function handleMessages(sock, messageUpdate) {
    let chatId = null;
    try {
        const { messages, type } = messageUpdate;
        if (type !== 'notify') return;

        const message = messages[0];
        if (!message?.message) return;

        chatId = message.key.remoteJid;
        const senderId = message.key.fromMe
            ? (sock.user?.id?.split(':')[0].split('@')[0] + '@s.whatsapp.net')
            : (message.key.participant || message.key.remoteJid);

        // Stockage pour antidelete
        try { storeMessage(sock, message); } catch (e) { console.error('storeMessage:', e.message); }

        // Détection de suppression de message
        try {
            if (message.message?.protocolMessage?.type === 0) {
                await handleMessageRevocation(sock, message);
                return;
            }
        } catch (e) { console.error('revocation:', e.message); }

        const isGroup = chatId.endsWith('@g.us');
        const isChannel = chatId.endsWith('@newsletter');
        if (isChannel) return;

        const senderIsOwnerOrSudo = message.key.fromMe || await isOwnerOrSudo(senderId, sock, chatId);
        const isPublic = readIsPublic();

        // ── Extraction du texte (sans préfixe requis) ──
        const rawText = (
            message.message?.conversation?.trim() ||
            message.message?.extendedTextMessage?.text?.trim() ||
            message.message?.imageMessage?.caption?.trim() ||
            message.message?.videoMessage?.caption?.trim() ||
            ''
        );
        if (!rawText) return;

        const lower = rawText.toLowerCase().trim();
        const [cmd, ...rest] = lower.split(/\s+/);
        const args = rest;
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;

        // En mode privé, seul le propriétaire/sudo peut utiliser les commandes
        if (!isPublic && !senderIsOwnerOrSudo) return;

        switch (cmd) {
            case 'menu':
                await menuCommand(sock, chatId, message);
                break;

            case 'ping':
                await pingCommand(sock, chatId, message);
                break;

            case 'owner':
                await ownerCommand(sock, chatId, message);
                break;

            case 'mode':
                if (!senderIsOwnerOrSudo) {
                    return sock.sendMessage(chatId, { text: 'Seul le propriétaire peut utiliser cette commande.' }, { quoted: message });
                }
                await modeCommand(sock, chatId, message, args[0]);
                break;

            case 'pair':
                await pairCommand(sock, chatId, message, args);
                break;

            case 'antidelete':
                if (!senderIsOwnerOrSudo) {
                    return sock.sendMessage(chatId, { text: 'Seul le propriétaire peut utiliser cette commande.' }, { quoted: message });
                }
                await handleAntideleteCommand(sock, chatId, message, args.join(' '));
                break;

            case 'humm':
                await hummCommand(sock, chatId, senderId, quoted, message);
                break;

            case 'waouh':
                await waouhCommand(sock, chatId, senderId, quoted, message);
                break;

            default:
                // Silence total pour tout ce qui n'est pas une des 8 commandes IB-SACKO
                break;
        }
    } catch (e) {
        console.error('handleMessages error:', e.message);
        if (chatId) {
            try { await sock.sendMessage(chatId, { text: '❌ Une erreur est survenue.' }); } catch {}
        }
    }
}

async function handleGroupParticipantUpdate() { /* non utilisé par IB-SACKO */ }
async function handleStatus() { /* non utilisé par IB-SACKO */ }

module.exports = { handleMessages, handleGroupParticipantUpdate, handleStatus };

