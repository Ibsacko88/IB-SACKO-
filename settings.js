require('dotenv').config();

const settings = {
  packname: process.env.PACK_NAME || 'IB-SACKO',
  author: process.env.PACK_AUTHOR || 'CENTRAL-HEX',
  botName: process.env.BOT_NAME || 'IB-SACKO',
  botOwner: process.env.OWNER_NAME || 'SALGA 🥷',
  ownerNumber: process.env.OWNER_NUMBER || '224669403581',
  ownerNumber2: process.env.OWNER_NUMBER_2 || '224662675862',
  developerName: process.env.DEVELOPER_NAME || 'IB-SACKO',
  developerNumber: process.env.DEVELOPER_NUMBER || '224621963059',
  system: 'CENTRAL-HEX',
  menuImage: process.env.MENU_IMAGE || 'https://i.ibb.co/3yPMZMFJ/IMG-20260919-WA0035.jpg',
  commandMode: process.env.COMMAND_MODE || 'public',
  maxStoreMessages: 20,
  storeWriteInterval: 10000,
  description: 'Bot WhatsApp IB-SACKO — sans préfixe — CENTRAL-HEX',
  version: process.env.BOT_VERSION || '1.0.0',
};

module.exports = settings;

