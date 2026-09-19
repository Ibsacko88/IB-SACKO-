require('dotenv').config();

// Filtre les logs bruyants de Baileys (bug connu : dump de session crypto complet)
const _origConsoleLog = console.log;
console.log = (...args) => {
    const first = args[0];
    if (typeof first === 'string' && (
        first.startsWith('Closing session') ||
        first.startsWith('Closing stale open session') ||
        first.startsWith('Closing open session')
    )) return;
    _origConsoleLog(...args);
};

const fs = require('fs');
const path = require('path');
const express = require('express');
const pino = require('pino');
const QRCode = require('qrcode');
const { Boom } = require('@hapi/boom');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
} = require('@whiskeysockets/baileys');

const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');
const settings = require('./settings');

global.botname = settings.botName;

const SESSIONS_DIR = path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// sessions[id] = { sock, status, qr, code, number }
const sessions = {};

function sanitizeId(id) {
    return String(id).replace(/[^0-9a-zA-Z_]/g, '');
}

const connectingLock = new Set();

async function startUserSession(number, { usePairingCode = false } = {}) {
    const id = sanitizeId(number);
    if (sessions[id]?.sock && sessions[id].status === 'connected') return sessions[id];
    if (connectingLock.has(id)) return sessions[id];
    connectingLock.add(id);

    if (sessions[id]?.sock) {
        try {
            sessions[id].sock.ev.removeAllListeners();
            sessions[id].sock.ws?.close();
        } catch {}
    }

    const sessionDir = path.join(SESSIONS_DIR, id);
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    let state, saveCreds, version;
    try {
        ({ state, saveCreds } = await useMultiFileAuthState(sessionDir));
        ({ version } = await fetchLatestBaileysVersion());
    } catch (e) {
        connectingLock.delete(id);
        throw e;
    }

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: usePairingCode ? Browsers.ubuntu('Chrome') : Browsers.macOS('Safari'),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }).child({ level: 'fatal' })),
        },
        syncFullHistory: false,
        markOnlineOnConnect: true
    });

    sessions[id] = { sock, status: usePairingCode ? 'requesting_code' : 'waiting_qr', qr: null, code: null, number };
    connectingLock.delete(id);

    if (usePairingCode && !state.creds.registered) {
        try {
            await new Promise(r => setTimeout(r, 1500));
            const rawCode = await sock.requestPairingCode(number.replace(/[^0-9]/g, ''));
            sessions[id].code = rawCode?.match(/.{1,4}/g)?.join('-') || rawCode;
            sessions[id].status = 'waiting_code';
        } catch (e) {
            console.error(`❌ [${id}] Erreur génération pairing code:`, e.message);
            sessions[id].status = 'error';
            sessions[id].error = e.message;
        }
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && !usePairingCode) {
            sessions[id].qr = await QRCode.toDataURL(qr);
            sessions[id].status = 'waiting_qr';
        }

        if (connection === 'open') {
            sessions[id].status = 'connected';
            sessions[id].qr = null;
            sessions[id].code = null;
            console.log(`✅ [${id}] IB-SACKO connecté (+${number}) !`);

            try {
                const ownJid = sock.user.id.split(':')[0].split('@')[0] + '@s.whatsapp.net';
                const caption = `╔══✦*𝗜𝗕-𝗦𝗔𝗖𝗞𝗢*✦═══>
║»🥷 *✅ BOT CONNECTÉ !*
╠══════════════════
║»📞 *Numéro :* +${number}
║»⏰ *Heure :* ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
║»🌐 *Système :* CENTRAL-HEX
╚══════════════════>

🎉 Ton bot est maintenant actif 24/24 et 7/7 !
💡 Tape *menu* pour découvrir toutes les commandes (aucun préfixe requis).

> 🥷 _by IB-SACKO · CENTRAL-HEX_`;

                await sock.sendMessage(ownJid, { image: { url: settings.menuImage }, caption });
            } catch (e) {
                console.error(`❌ [${id}] Message de bienvenue:`, e.message);
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output?.statusCode : null;
            const registered = !!sock.authState?.creds?.registered;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            if (registered && sessions[id].status !== 'connected') {
                console.log(`♻️ [${id}] Pairing réussi, relance de la session...`);
                setTimeout(() => startUserSession(number, { usePairingCode: false }), 2000);
                return;
            }

            if (shouldReconnect) {
                setTimeout(() => startUserSession(number, { usePairingCode: false }), 3000);
            } else {
                console.log(`🚪 [${id}] Déconnecté (logout). Session supprimée.`);
                sessions[id].status = 'logged_out';
                try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch {}
            }
        }
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try { await handleMessages(sock, chatUpdate, true); } catch (e) { console.error('handleMessages error:', e.message); }
    });
    sock.ev.on('group-participants.update', async (update) => {
        try { await handleGroupParticipantUpdate(sock, update); } catch (e) {}
    });
    sock.ev.on('messages.reaction', async (status) => {
        try { await handleStatus(sock, status); } catch (e) {}
    });

    return sessions[id];
}

global.startUserSession = startUserSession;

function getSession(id) {
    return sessions[sanitizeId(id)];
}

async function resumeAllSessions() {
    const ids = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

    for (const id of ids) {
        if (!fs.existsSync(path.join(SESSIONS_DIR, id, 'creds.json'))) continue;
        console.log(`♻️ Reprise automatique de la session : ${id}`);
        try { await startUserSession(id, { usePairingCode: false }); }
        catch (e) { console.error(`❌ Échec reprise ${id}:`, e.message); }
    }
}

// ═══════════════════════════════════════════════════════════
// 🌐 SERVEUR WEB — page de connexion IB-SACKO
// ═══════════════════════════════════════════════════════════
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/pair', async (req, res) => {
    try {
        const { number } = req.body;
        const cleanNumber = String(number || '').replace(/[^0-9]/g, '');
        if (!cleanNumber || cleanNumber.length < 8) {
            return res.status(400).json({ error: 'Numéro invalide. Utilise le format international sans + (ex: 224621963059).' });
        }

        const sessionId = sanitizeId(cleanNumber);
        await startUserSession(cleanNumber, { usePairingCode: true });

        let tries = 0;
        while (tries < 30) {
            const s = getSession(sessionId);
            if (s?.status === 'waiting_code' && s.code) return res.json({ sessionId, code: s.code });
            if (s?.status === 'error') return res.status(500).json({ error: s.error || 'Erreur génération du code.' });
            if (s?.status === 'connected') return res.json({ sessionId, connected: true });
            await new Promise(r => setTimeout(r, 500));
            tries++;
        }
        return res.status(504).json({ error: 'Le code met trop de temps à être généré, réessaie.' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/qr', async (req, res) => {
    try {
        const sessionId = `qr_${Date.now()}`;
        await startUserSession(sessionId, { usePairingCode: false });
        res.json({ sessionId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/status/:sessionId', (req, res) => {
    const s = getSession(req.params.sessionId);
    if (!s) return res.status(404).json({ error: 'Session introuvable' });
    res.json({ status: s.status, qr: s.qr || null, code: s.code || null });
});

app.post('/api/reset', async (req, res) => {
    try {
        const { number } = req.body;
        const cleanNumber = String(number || '').replace(/[^0-9]/g, '');
        if (!cleanNumber || cleanNumber.length < 8) {
            return res.status(400).json({ error: 'Numéro invalide.' });
        }

        const id = sanitizeId(cleanNumber);
        const sessionDir = path.join(SESSIONS_DIR, id);

        if (sessions[id]?.sock) {
            try { await sessions[id].sock.logout(); } catch (e) {}
            try { sessions[id].sock.ws?.close(); } catch (e) {}
        }
        delete sessions[id];

        if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });

        console.log(`🗑️ [${id}] Session réinitialisée manuellement.`);
        res.json({ ok: true, message: 'Session réinitialisée. Tu peux relancer un pairing.' });
    } catch (e) {
        console.error('❌ [reset]', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ ok: true, bot: 'IB-SACKO', sessions: Object.keys(sessions).length, uptime: process.uptime() });
});

app.listen(PORT, () => {
    console.log(`🥷 IB-SACKO — serveur de pairing lancé sur http://localhost:${PORT}`);
    resumeAllSessions().catch(e => console.error('resumeAllSessions error:', e.message));
    startSelfPing();
});

// Auto-ping : empêche l'hébergeur (Render, Koyeb, Railway...) de mettre le service
// en veille par inactivité. Utilise RENDER_EXTERNAL_URL ou APP_URL (.env).
function startSelfPing() {
    const selfUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || null;
    if (!selfUrl) {
        console.log('ℹ️ Auto-ping désactivé (définis APP_URL dans le .env si besoin).');
        return;
    }
    const axios = require('axios');
    const pingUrl = `${selfUrl.replace(/\/$/, '')}/health`;
    const INTERVAL_MS = 4 * 60 * 1000;

    setInterval(async () => {
        try {
            await axios.get(pingUrl, { timeout: 15000 });
            console.log(`💓 Auto-ping OK (${new Date().toLocaleTimeString('fr-FR')})`);
        } catch (e) {
            console.error('⚠️ Auto-ping échoué:', e.message);
        }
    }, INTERVAL_MS);

    console.log(`💓 Auto-ping activé sur ${pingUrl} (toutes les 4 min)`);
}

process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));

