/**
 * PAIR COMMAND — IB-SACKO V2.0
 * Génère un code de liaison pour connecter le bot
 * by CENTRAL-HEX 💎
 */

const fs = require('fs');
const path = require('path');
const pino = require('pino');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    Browsers,
    delay
} = require('@whiskeysockets/baileys');

const channelInfo = {
    forwardingScore: 1, isForwarded: true,
    forwardedNewsletterMessageInfo: {
        newsletterJid: '120363427860148318@newsletter',
        newsletterName: 'IB-SACKO', serverMessageId: -1
    }
};

const activePairSessions = {};

function makeid(length = 6) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

function removeDir(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    fs.rmSync(dirPath, { recursive: true, force: true });
}

async function pairCommand(sock, chatId, message, args) {
    const number = args[0]?.replace(/[^0-9]/g, '');

    if (!number || number.length < 7) {
        return await sock.sendMessage(chatId, {
            image: { url: require('../settings').menuImage },
            caption: `╔═══════════════════════╗\n║  🥷 *𝗜𝗕-𝗦𝗔𝗖𝗞𝗢* 🥷  ║\n╠═══════════════════════╣\n║   📲 *CONNEXION BOT*      ║\n╚═══════════════════════╝\n\n🔑 *Pairing Code WhatsApp*\n\n💡 *Usage :*\n┌──────────────────────\n│ .pair <ton numéro>\n│ _Exemple : .pair 224666952949_\n└──────────────────────\n\n📌 *Étapes :*\n┌──────────────────────\n│ 1️⃣ Tape .pair <numéro>\n│ 2️⃣ Reçois ton code\n│ 3️⃣ WhatsApp → ⋮ → Appareils liés\n│ 4️⃣ Connecter avec numéro de tél.\n│ 5️⃣ Entre le code reçu\n│ ✅ Bot connecté !\n└──────────────────────\n\n> _Propulsé par 🥷 IB-SACKO · CENTRAL-HEX_`,
            contextInfo: channelInfo
        }, { quoted: message });
    }

    if (activePairSessions[number]) {
        return await sock.sendMessage(chatId, {
            text: `⚠️ *Une session est déjà en cours pour ce numéro.*\n_Attends quelques secondes et réessaie._`,
            contextInfo: channelInfo
        }, { quoted: message });
    }

    await sock.sendMessage(chatId, {
        text: `⏳ *Génération du code...*\n📞 *Numéro :* +${number}\n\n_Patiente quelques secondes..._`,
        contextInfo: channelInfo
    }, { quoted: message });

    const sessionId = makeid();
    const tempDir = path.join(process.cwd(), 'temp_pair', sessionId);
    activePairSessions[number] = true;

    try {
        const { state, saveCreds } = await useMultiFileAuthState(tempDir);

        const tempSock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(
                    state.keys,
                    pino({ level: 'fatal' }).child({ level: 'fatal' })
                ),
            },
            printQRInTerminal: false,
            logger: pino({ level: 'fatal' }).child({ level: 'fatal' }),
            browser: Browsers.ubuntu('Chrome'),
            syncFullHistory: false,
        });

        tempSock.ev.on('creds.update', saveCreds);

        let codeSent = false;

        // ✅ FIX : demander le code uniquement quand connecting (pas closed)
        tempSock.ev.on('connection.update', async (s) => {
            const { connection, lastDisconnect, qr } = s;

            // Attendre que le socket soit en train de se connecter
            if (!codeSent && !tempSock.authState.creds.registered && connection === 'connecting') {
                codeSent = true;
                try {
                    await delay(5000);
                    const code = await tempSock.requestPairingCode(number.trim());
                    const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;

                    await sock.sendMessage(chatId, {
                        image: { url: require('../settings').menuImage },
                        caption: `╔═══════════════════════╗\n║  🥷 *𝗜𝗕-𝗦𝗔𝗖𝗞𝗢* 🥷  ║\n╠═══════════════════════╣\n║   📲 *CODE DE LIAISON*    ║\n╚═══════════════════════╝\n\n📞 *Numéro :* +${number}\n\n🔑 *Ton code :*\n┌──────────────────────\n│ \`\`\`${formattedCode}\`\`\`\n└──────────────────────\n\n📌 *Comment l'utiliser :*\n┌──────────────────────\n│ 1️⃣ Ouvre WhatsApp\n│ 2️⃣ ⋮ → Appareils liés\n│ 3️⃣ Lier un appareil\n│ 4️⃣ Connecter avec numéro\n│ 5️⃣ Entre : *${formattedCode}*\n│ ✅ Bot connecté !\n└──────────────────────\n\n⏰ *Ce code expire dans 60 secondes !*\n\n> _Propulsé par 🥷 IB-SACKO · CENTRAL-HEX_`,
                        contextInfo: channelInfo
                    }, { quoted: message });
                } catch (codeErr) {
                    delete activePairSessions[number];
                    removeDir(tempDir);
                    await sock.sendMessage(chatId, {
                        text: `❌ *Erreur génération code :* ${codeErr.message}\n\n_Vérifie que le numéro est correct et a WhatsApp._`,
                        contextInfo: channelInfo
                    }, { quoted: message });
                }
            }

            let finalized = false;

            // Copie la session temporaire vers sessions/<numéro>/ et démarre le vrai bot.
            // Appelée que la connexion passe par 'open' OU par 'close' (WhatsApp ferme
            // souvent ce socket temporaire juste après l'utilisation du code — c'est
            // normal, il ne faut pas le traiter comme un échec dans ce cas).
            async function finalizeSuccess() {
                if (finalized) return;
                finalized = true;

                await delay(1000);

                const sessionDir = path.join(process.cwd(), 'sessions', number);
                if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

                try {
                    const files = fs.readdirSync(tempDir);
                    for (const file of files) {
                        fs.copyFileSync(path.join(tempDir, file), path.join(sessionDir, file));
                    }
                } catch (e) {
                    console.error('❌ [pair] copie session:', e.message);
                }

                try {
                    await sock.sendMessage(chatId, {
                        text: `╔═══════════════════════╗\n║  🥷 *𝗜𝗕-𝗦𝗔𝗖𝗞𝗢* 🥷  ║\n╠═══════════════════════╣\n║   ✅ *BOT CONNECTÉ !*      ║\n╚═══════════════════════╝\n\n🎉 *Connexion réussie !*\n📞 *Numéro :* +${number}\n\nTape *.menu* pour voir toutes les commandes !\n\n> _Propulsé par 🥷 IB-SACKO · CENTRAL-HEX_`,
                        contextInfo: channelInfo
                    }, { quoted: message });
                } catch (e) {}

                delete activePairSessions[number];
                try { await tempSock.ws.close(); } catch (e) {}
                removeDir(tempDir);

                if (global.startUserSession) {
                    await global.startUserSession(number);
                }
            }

            if (connection === 'open') {
                await finalizeSuccess();
            } else if (connection === 'close') {
                // ⚠️ WhatsApp ferme souvent ce socket temporaire juste après l'utilisation
                // du code — ce n'est PAS forcément un échec. On vérifie si les creds sont
                // enregistrées avant de tout supprimer.
                const registered = !!tempSock.authState?.creds?.registered;
                if (registered) {
                    await finalizeSuccess();
                } else {
                    delete activePairSessions[number];
                    removeDir(tempDir);
                }
            }
        });

        // Timeout 3 minutes
        setTimeout(() => {
            if (activePairSessions[number]) {
                delete activePairSessions[number];
                try { tempSock.ws.close(); } catch (e) {}
                removeDir(tempDir);
            }
        }, 3 * 60 * 1000);

    } catch (error) {
        console.error('❌ [pair]', error.message);
        delete activePairSessions[number];
        removeDir(tempDir);

        await sock.sendMessage(chatId, {
            text: `❌ *Impossible de générer le code.*\n\n_Erreur : ${error.message}_`,
            contextInfo: channelInfo
        }, { quoted: message });
    }
}

module.exports = pairCommand;
