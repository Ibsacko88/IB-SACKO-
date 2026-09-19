const settings = require('../settings');

const channelInfo = {
    forwardingScore: 1, isForwarded: true,
    forwardedNewsletterMessageInfo: {
        newsletterJid: '120363427860148318@newsletter',
        newsletterName: 'IB-SACKO', serverMessageId: -1
    }
};

async function ownerCommand(sock, chatId, message) {
    const caption = `╔════✦𝗜𝗕-𝗦𝗔𝗖𝗞𝗢✦════✰
║»✰ *LE BOT A ÉTÉ CRÉÉ PAR*
║»✰ ${settings.developerName}
║»✰ *Contact*
║»✰ ${settings.developerNumber}
║
║»✰ *PROPRIÉTAIRE*
║»✰ ${settings.botOwner}
║»✰ *Contact*
║»✰ ${settings.ownerNumber}
║»✰ ${settings.ownerNumber2}
║
║»✰ *DANS LE SYSTÈME*
║»✰ ${settings.system}
╚══════════════════✰`;

    const vcards = [
        { displayName: settings.developerName, vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${settings.developerName}\nTEL;waid=${settings.developerNumber}:${settings.developerNumber}\nEND:VCARD` },
        { displayName: settings.botOwner, vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${settings.botOwner}\nTEL;waid=${settings.ownerNumber}:${settings.ownerNumber}\nEND:VCARD` }
    ];

    try {
        await sock.sendMessage(chatId, {
            image: { url: settings.menuImage },
            caption,
            contextInfo: channelInfo
        }, { quoted: message });

        await sock.sendMessage(chatId, {
            contacts: { displayName: 'Contacts IB-SACKO', contacts: vcards }
        });
    } catch (e) {
        console.error('❌ [owner]', e.message);
        await sock.sendMessage(chatId, { text: caption, contextInfo: channelInfo }, { quoted: message });
    }
}

module.exports = ownerCommand;
