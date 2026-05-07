const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

/* =========================
   EXPRESS / HEALTHCHECK
   (en Railway puede servir para health checks)
========================= */
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (_req, res) => {
  res.send('Bot activo 😎');
});

app.get('/healthz', (_req, res) => {
  res.status(200).send('ok');
});

app.listen(PORT, () => {
  console.log(`🌐 Express escuchando en puerto ${PORT}`);
});

/* =========================
   DISCORD CLIENT
========================= */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers
  ]
});

/* =========================
   ESTADO / MEMORIA
========================= */
const state = {
  userMessageCounts: new Map(),
  lastReplyByUser: new Map(),
  triggerCooldowns: new Map(),
  lastResponseByGroup: new Map()
};

/* =========================
   CONFIG
========================= */

// cooldown general por usuario
const USER_REPLY_COOLDOWN_MS = 7 * 60 * 1000;

// cooldowns por trigger
const TRIGGER_COOLDOWNS = {
  saludo: 5 * 60 * 1000,
  erga: 5 * 60 * 1000,
  trece: 5 * 60 * 1000,
  cinco: 5 * 60 * 1000,
  hueva: 6 * 60 * 1000,
  calor: 6 * 60 * 1000,
  frio: 6 * 60 * 1000,
  blanco: 5 * 60 * 1000,
  huevos: 5 * 60 * 1000,
  sed: 5 * 60 * 1000,
  mention: 3 * 60 * 1000,
  sticker_esta: 5 * 60 * 1000,
  sticker_pooh: 5 * 60 * 1000,
  define: 5 * 1000,
  consejo: 5 * 1000,
  ortografia: 5 * 1000,
  flood: 10 * 60 * 1000
};

// probabilidad de responder
const DEFAULT_REPLY_PROBABILITY = 0.35;
const MENTION_REPLY_PROBABILITY = 0.85;
const DEFINE_REPLY_PROBABILITY = 1;
const FLOOD_REPLY_PROBABILITY = 0.9;
const STICKER_REPLY_PROBABILITY = 0.6;

/* =========================
   HELPERS
========================= */
function now() {
  return Date.now();
}

function stripDiscordCustomEmojis(text) {
  return text.replace(/<a?:\w+:\d+>/g, '').trim();
}

function isOnlyEmojiLike(text) {
  const cleaned = stripDiscordCustomEmojis(text)
    .replace(/\s/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '');

  return cleaned.length === 0 && text.trim().length > 0;
}

function hasAttachmentsOrEmbeds(message) {
  return (
    message.attachments.size > 0 ||
    message.embeds.length > 0 ||
    message.stickers.size > 0
  );
}

function isTextOnlyMessage(message) {
  if (hasAttachmentsOrEmbeds(message)) return false;
  if (!message.content || !message.content.trim()) return false;
  if (isOnlyEmojiLike(message.content)) return false;
  return true;
}

function userCanReceiveReply(userId) {
  const last = state.lastReplyByUser.get(userId) || 0;
  return now() - last >= USER_REPLY_COOLDOWN_MS;
}

function markUserReply(userId) {
  state.lastReplyByUser.set(userId, now());
}

function triggerKey(guildId, channelId, triggerName) {
  return `${guildId || 'dm'}:${channelId}:${triggerName}`;
}

function triggerAvailable(message, triggerName) {
  const key = triggerKey(message.guildId, message.channelId, triggerName);
  const last = state.triggerCooldowns.get(key) || 0;
  const cooldown = TRIGGER_COOLDOWNS[triggerName] || 60000;
  return now() - last >= cooldown;
}

function markTrigger(message, triggerName) {
  const key = triggerKey(message.guildId, message.channelId, triggerName);
  state.triggerCooldowns.set(key, now());
}

function shouldReply(probability = DEFAULT_REPLY_PROBABILITY) {
  return Math.random() < probability;
}

function pickRandom(groupName, arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;

  const last = state.lastResponseByGroup.get(groupName);

  if (arr.length === 1) {
    state.lastResponseByGroup.set(groupName, arr[0]);
    return arr[0];
  }

  let choice = null;
  let tries = 0;

  do {
    choice = arr[Math.floor(Math.random() * arr.length)];
    tries++;
  } while (choice === last && tries < 10);

  state.lastResponseByGroup.set(groupName, choice);
  return choice;
}

async function replyWithControl(
  message,
  triggerName,
  responseGroup,
  responses,
  probability = DEFAULT_REPLY_PROBABILITY
) {
  if (!userCanReceiveReply(message.author.id)) return false;
  if (!triggerAvailable(message, triggerName)) return false;
  if (!shouldReply(probability)) return false;

  const text = pickRandom(responseGroup, responses);
  if (!text) return false;

  await message.reply(text);
  markUserReply(message.author.id);
  markTrigger(message, triggerName);
  return true;
}

function getTriggerRemainingMs(message, triggerName) {
  const key = triggerKey(message.guildId, message.channelId, triggerName);
  const last = state.triggerCooldowns.get(key) || 0;
  const cooldown = TRIGGER_COOLDOWNS[triggerName] || 60000;
  const remaining = cooldown - (now() - last);

  return remaining > 0 ? remaining : 0;
}

/* =========================
   RESPUESTAS
========================= */
const RESPUESTAS = {
  bienvenida: [
    "_Quiúbole, ya cayó otro al desmadre. Pásale, nomás no andes de sensible._ 😎",
    "_Ya llegó la bandita. Guarda cartera y celular, ya te la sabes._ 🔫",
    "_Órale, uno más pal barrio digital. Siéntese donde no estorbe._ 🪑",
    "_Bienvenido al congal, mi rey. Aquí puro fino caballero de Iztapalapa._ 🏙️",
    "_Pásele, pásele. No hay devoluciones ni cambios de personalidad._ 🛒",
    "_Otro más pa'l cotorreo. A ver si sí aguanta vara._ 😏"
  ],
  despedida: [
    "_Ya se peló el tilico. Que le vaya recio._ 💨",
    "_Se nos fue, como quincena en Coppel._ 🧾",
    "_Otro que no aguantó el barrio. Ni modo._ 👋",
    "_Ya salió fugado. Cierren la cortina._ 🚪",
    "_Duró menos que oferta de tianguis._ 🛍️"
  ],
  saludoManana: [
    "_Buenos días, mi tamal oaxaqueño._ ☀️",
    "_Quiúbole, ya andas al tiro desde temprano, mi rey._ ☕",
    "_Buenos días, mi café aguado del Oxxo._ 🥤",
    "_Ya amanecimos, gracias a Dios y al ruido de la combi._ 🚌"
  ],
  saludoTarde: [
    "_Buenas, mi chacalón consentido._ 😎",
    "_Qué Pachuca por Toluca, mi banda._ 🌮",
    "_Buenas tardes, mi torta de milanesa._ 🥪",
    "_Qué tranza, ya saliste del jale o nomás te estás haciendo güey._ 😏"
  ],
  saludoNoche: [
    "_Buenas noches, mi cobija del San Marcos._ 🌙",
    "_Qué onda, ya vas pa' la meme o qué show._ 🛏️",
    "_Buenas noches, mi foco ahorrador._ 💡",
    "_A esta hora ya huele a taco y decisiones malas._ 🌮"
  ],
  erga: [
    "_¡Comes!_ 😏",
    "_¡Provecho, goloso!_ 🥴",
    "_¡Chupas!_ 💦",
    "_¿Con eso desayunas o nomás lo contemplas?_ 👀",
    "_Ya salió el catador oficial del barrio._ 🎩",
    "_Se ve que traes el tema bien estudiado, mi rey._ 📚"
  ],
  trece: [
    "_¡Entre más me la mamas, más me crece!_ 😏",
    "_¡Dilo sin miedo, cobarde!_ 😂",
    "_¡No te me frenes en curva, campeón!_ 🛞",
    "_Ya salió el matemático del albúr._ 🧠",
    "_Ese número viene con jiribilla, mi todo tibio._ 😌"
  ],
  cinco: [
    "_Cinco... y por el culo te la hinco._ 😮‍💨",
    "_Cinquito y quedas viendo pa' Cuauhtémoc._ 👀",
    "_Cinco, pero de dignidad te faltan como tres kilos._ 🪙",
    "_Ya te vi, contando con intenciones raras._ 🤨"
  ],
  hueva: [
    "_No mames, traes más hueva que burócrata en viernes._ 🪑",
    "_Ándale pues, mi rey, tú nomás no naciste pa' la productividad._ 📉",
    "_Te pesa más la existencia que una bolsa del tianguis._ 🛍️",
    "_Con esa actitud ni el micro te hace la parada._ 🚌",
    "_Traes una flojera marca Tepito edición limitada._ 😴"
  ],
  calor: [
    "_No inventes, está haciendo un calor de la chingada._ 🔥",
    "_Con este calor hasta el diablo pide Bonafont._ 🧃",
    "_Ya huele a axila y desesperación, mi rey._ 🥵",
    "_Está pa' freír quesadillas en el cofre._ 🌞"
  ],
  frio: [
    "_Está helando macizo, mi todo tieso._ 🥶",
    "_Con este frío hasta el tamalero trae chamarra._ 🧣",
    "_Ya parece clima de azotea en Ecatepec._ ❄️",
    "_Hace un frillazo que ni ganas de ser persona._ ☕"
  ],
  blanco: [
    "_¿Blanco? Como pared de vecindad recién pintada._ 🎨",
    "_Blanco, pero no tanto como tus intenciones raras._ 👀",
    "_Eso ya sonó a albúr de albañil fino._ 🧱",
    "_Uy, ya salió el yesero sentimental._ 😏"
  ],
  huevos: [
    "_¡Chupas y dejas nuevos!_ 😏",
    "_¡Cromas, mi brillante sin futuro!_ 🧽",
    "_¡Te sientas y se acomodan!_ 🪑",
    "_Ya salió el especialista en tanatología de barrio._ 🥚",
    "_Con razón hablas con tanta confianza del tema._ 🤨"
  ],
  sed: [
    "_¡De la peligrosa!_ 😈",
    "_¡De la que destruye hogares!_ 🍻",
    "_¡De la mala, mi cuervo en celo!_ 🐦‍⬛",
    "_No es sed, ya es trámite notarial._ 🧾",
    "_Eso ya no es sed, es vocación._ 😂"
  ],
  mention: [
    "_¿Qué pasó, mi rey? ¿Ya te dio ansiedad o qué?_ 😌",
    "_Háblame bonito, que no soy de palo._ 🪵",
    "_¿Ahora qué quieres, mi becario del barrio?_ 🧃",
    "_Nomás me arrobaste y ya huele a pedo ajeno._ 💨",
    "_A ver, escúpelo ya, mi filósofo de combi._ 🚌"
  ],
  stickerEsta: [
    "_¡Ah chinga, ya sacó la longaniza del metro!_ 🚇",
    "_¿Tienes frío o así está siempre?_ 🥶",
    "_¡Guárdala, que espantas a los niños!_ 😳",
    "_¿Eso es de exhibición o sí jala?_ 🤨",
    "_¡Órale! Hasta se me cayó el chicle del susto._ 😮",
    "_Cálmate, mi rey, que esto no es vitrina._ 🪟",
    "_Aguas, luego lo confunden con poste de luz._ 🚧",
    "_¿Eso viene con manual o nomás presumes?_ 📖"
  ],
  stickerPooh: [
    "_Ya llegó el jefe de Temu, banda._ 🛍️",
    "_Ese no es Pooh, es el licenciado del arroz._ 🍚",
    "_Con ese sticker ya te aprobaron el crédito social._ 🧧",
    "_Ya cayó el oso de importación, mi camarada._ 🐻",
    "_Con eso ya te dan descuento en mercancía que no pasa aduana._ 📦"
  ],
  flood: [
    "_Ya siéntese, mi todo tibio._ 🪑",
    "_Cálmese, que esto no es su diario personal._ 📓",
    "_Ya bájale dos rayitas, mi teclado con patas._ ⌨️",
    "_Mi rey, no estás cobrando por mensaje._ 😮‍💨",
    "_Nomás te falta narrar tu propia biografía._ 🎬"
  ],
  definePrompt: [
    "_Dime qué quieres que te defina, mi enciclopedia pirata._ 📚",
    "_Échame la palabra, mi sabio del tianguis._ 🤓",
    "_¿Qué ocupas saber, mi Wikipedia de microbús?_ 🚌",
    "_A ver, pregúntame bien, mi intelectual del puesto de jugos._ 🍊"
  ],
  defineFail: [
    "_Ni doña pelos sabe qué es eso, mi rey._ 🤯",
    "_Eso ya está muy underground hasta pa' mí._ 🫠",
    "_No encontré ni madres, la neta._ 🫥",
    "_Eso ni el diccionario de Tepito lo trae._ 📕"
  ],
  defineError: [
    "_Se cayó el diccionario del barrio, ahorita no jalo._ 👶🏻",
    "_No pude buscar eso, me falló el cerebrito._ 🧠",
    "_Ahorita no traigo datos, mi rey._ 📵"
  ],
  defineRemate: [
    "_Con eso ya puedes aparentar en la peda._ 🍻",
    "_Ahora sí, ya puedes tirar verbo sin fundamento._ 😎",
    "_Pa' que no se diga que no se aprende en el barrio._ 📚",
    "_Ya con eso te sientes académico del tianguis._ 🎓"
  ],
  deleted: [
    "_Ya se te frunció el mensaje, ¿eh?_ 🤏",
    "_Si vas a rajar, mejor ni escribas, mi tibio._ 💅",
    "_No le saques, pecho palomo._ 🕊️",
    "_Ay, ya se arrepintió la criatura._ 🫢",
    "_Eso no se borra ni con jabón Zote._ 🧼",
    "_Se echó pa' atrás el poeta del barrio._ 🎭"
  ],

  consejos: [
    "_Consejo del día: nunca confíes en alguien que dice 'ahorita llego' desde Indios Verdes._ 🚌",
    "_Consejo fino: si ya dijiste 'última chela', todavía faltan tres._ 🍻",
    "_Consejo de barrio: el que se enoja, pierde; el que se ríe, cobra._ 😎",
    "_Consejo espiritual: no tomes decisiones importantes con hambre y doce pesos en la cuenta._ 🧾",
    "_Consejo de microbús: agárrate bien, porque la vida no frena en topes._ 🚐",
    "_Consejo de oro: no le escribas a tu ex, mejor cómprate unos tacos._ 🌮",
    "_Consejo de la calle: si algo suena demasiado barato, probablemente viene sin cargador._ 📦",
    "_Consejo godín: no abras Excel después de las 6 si todavía valoras tu alma._ 💻"
  ],

  ortografia: [
    "_¿Yoyis?_",
    "_Mi rey, esa palabra salió atropellada por un microbús._ 🚌",
    "_Escríbelo otra vez, pero ahora sin aventarlo por las escaleras._ 🪜",
    "_No entendí si preguntaste o invocaste un demonio del Metro._ 🚇",
    "_Eso no fue falta de ortografía, fue crimen lingüístico._ 🚔",
    "_La RAE acaba de bloquearte, mi todo teclado._ 📚",
    "_Mi compa, esa frase llegó en combi pirata y sin placas._ 🚐",
    "_Repite eso, pero usando las manos y no el codo._ ✍️",
    "_¿Eso era español o contraseña del WiFi de una fonda?_ 📶"
  ]
};

const PINCHES = [
  {
    nombre: 'val',
    aliases: ['val', 'valark'],
    url: 'https://media.discordapp.net/attachments/1385452767954604042/1501583980556976219/image-1.png'
  },
  {
    nombre: 'jagg',
    aliases: ['jagg', 'jagger', 'jaggerr', 'grimm'],
    url: 'https://media.discordapp.net/attachments/1441884248234655766/1501404101106335745/image.png'
  },
  {
    nombre: 'meen',
    aliases: ['meen', 'meenah', 'meena', 'min'],
    url: 'https://media.discordapp.net/attachments/1441884248234655766/1501404772408885350/image.png'
  },
  {
    nombre: 'lic',
    aliases: ['lic', 'licenciado', 'nahual', 'lisensiado'],
    url: 'https://media.discordapp.net/attachments/1441884248234655766/1501404772757143672/image.png'
  },
  {
    nombre: 'yoyis',
    aliases: ['yoyis', 'iois', 'yoyo'],
    url: 'https://media.discordapp.net/attachments/1441884248234655766/1501405529136697515/image.png'
  },
  {
    nombre: 'akmo',
    aliases: ['akmo', 'akm', 'akmodhan', 'akmodan'],
    url: 'https://media.discordapp.net/attachments/1441884248234655766/1501405530256572558/image.png'
  }
];

const PINCHES_RANDOM = [
  'https://media.discordapp.net/attachments/1441884248234655766/1501404101576233091/image.png',
  'https://pbs.twimg.com/media/FxoZPTsXwAAxJen.jpg'
];
/* =========================
   EVENTOS
========================= */
client.once('ready', () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
});

client.on('error', (err) => {
  console.error('Discord client error:', err);
});

client.on('warn', (info) => {
  console.warn('Discord warning:', info);
});

client.on('guildMemberAdd', async (member) => {
  const canal = member.guild.systemChannel;
  if (!canal) return;

  const msg = pickRandom('bienvenida', RESPUESTAS.bienvenida);
  if (msg) await canal.send(`${member} ${msg}`);
});

client.on('guildMemberRemove', async (member) => {
  const canal = member.guild.systemChannel;
  if (!canal) return;

  const msg = pickRandom('despedida', RESPUESTAS.despedida);
  if (msg) await canal.send(`${member.user.username} ${msg}`);
});

/* =========================
   MENSAJES
========================= */
client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;

    const texto = (message.content || '').toLowerCase().trim();
    const isPlainText = isTextOnlyMessage(message);

    /* ===== !CONSEJO ===== */
    if (texto === '!consejo') {
      if (!triggerAvailable(message, 'consejo')) return;

      const consejo = pickRandom('consejos_group', RESPUESTAS.consejos);
      if (!consejo) return;

      await message.reply(consejo);
      markTrigger(message, 'consejo');
      return;
    }

        /* ===== !STICKERS PINCHE ===== */
    if (texto.startsWith('!pinche')) {
        const partes = texto.split(' ');
        const argumento = partes[1]?.toLowerCase().trim();

        if (!argumento) {
            const randomUrl = pickRandom('pinches_random_group', PINCHES_RANDOM);
            await message.reply(randomUrl);
            return;
        }

        const pinche = PINCHES.find(p => p.aliases.includes(argumento));

        if (pinche) {
            await message.reply(pinche.url);
            return;
        }

        const randomUrl = pickRandom('pinches_random_group', PINCHES_RANDOM);
        await message.reply(randomUrl);
        return;
    }


    /* ===== !define ===== */
    if (texto.startsWith('!define')) {
        const remaining = getTriggerRemainingMs(message, 'define');
      
        if (remaining > 0) {
          const seconds = Math.ceil(remaining / 1000);
          await message.reply(`_Aguanta ${seconds}s, mi diccionario de combi todavía está cargando._ 🚌`);
          return;
        }

      const query = texto.replace('!define', '').trim();

      if (!query) {
        await replyWithControl(
          message,
          'define',
          'definePrompt',
          RESPUESTAS.definePrompt,
          DEFINE_REPLY_PROBABILITY
        );
        return;
      }

      try {
        let definicion = null;
        let fuente = null;

        /* ===== 1) WIKIPEDIA ES ===== */
        try {
          const wikiUrl = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;

          const wikiRes = await axios.get(wikiUrl, {
            headers: {
              'User-Agent': 'DiscordBotChaca/1.0'
            }
          });

          if (
            wikiRes.data &&
            wikiRes.data.extract &&
            !wikiRes.data.type?.includes('disambiguation')
          ) {
            definicion = wikiRes.data.extract;
            fuente = 'Wikipedia';
          }
        } catch (wikiErr) {
          console.log('Wikipedia no encontró definición:', wikiErr.message);
        }

        /* ===== 2) FALLBACK DUCKDUCKGO ===== */
        if (!definicion) {
          try {
            const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&kl=es-es`;
            const ddgRes = await axios.get(ddgUrl);
            const data = ddgRes.data;

            definicion =
              data.Abstract ||
              data.Definition ||
              data.RelatedTopics?.[0]?.Text ||
              null;

            if (definicion) fuente = 'DuckDuckGo';
          } catch (ddgErr) {
            console.log('DuckDuckGo tampoco encontró definición:', ddgErr.message);
          }
        }

      if (!definicion) {
        const fail = pickRandom('defineFail', RESPUESTAS.defineFail);
        await message.reply(fail || "_No encontré ni madres, la neta._ 🫥");
        markTrigger(message, 'define');
        return;
      }


        const remate = pickRandom('defineRemate', RESPUESTAS.defineRemate);

        // Limita texto para que no mande biblias
        const definicionCorta =
          definicion.length > 700
            ? definicion.slice(0, 700).trim() + '...'
            : definicion;

        await message.reply(`**${query}:** ${definicionCorta}\n_Fuente: ${fuente}._\n${remate}`);

        markTrigger(message, 'define');
        return;
      } catch (err) {
           console.error('Error en definición:', err.message);
         
           const errorMsg = pickRandom('defineError', RESPUESTAS.defineError);
           await message.reply(errorMsg || "_Ahorita no traigo datos, mi rey._ 📵");
         
           markTrigger(message, 'define');
           return;
         }
    }

    /* ===== STICKERS ===== */
    if (message.stickers.size > 0) {
      const sticker = message.stickers.first();
      const stickerName = sticker?.name?.toLowerCase() || '';

      if (stickerName.includes('esta')) {
        await replyWithControl(
          message,
          'sticker_esta',
          'sticker_esta_group',
          RESPUESTAS.stickerEsta,
          STICKER_REPLY_PROBABILITY
        );
        return;
      }

      if (stickerName.includes('pooh')) {
        await replyWithControl(
          message,
          'sticker_pooh',
          'sticker_pooh_group',
          RESPUESTAS.stickerPooh,
          STICKER_REPLY_PROBABILITY
        );
        return;
      }

      return;
    }

    /* ===== si trae foto/gif/embed/emoji only, no activa estos triggers ===== */
    if (!isPlainText) {
      return;
    }

         /* ===== ORTOGRAFÍA HORRIBLE ===== */
    if (/\b(prejunta|pregumta|preguntq|me justa|me guta|grasias|ola k ase|aber|haiga|haci|asiendo|enserio|encerio|vistes|fuistes|hicistes|dijistes|nadien|ocupo saber|ke|kiero|qiero)\b/.test(texto)) {
      const sent = await replyWithControl(
        message,
        'ortografia',
        'ortografia_group',
        RESPUESTAS.ortografia,
        0.6
      );
      if (sent) return;
    }
    /* ===== MENCIONES ===== */
    let isReplyToBot = false;
    if (message.reference?.messageId) {
      try {
        const refMsg = await message.channel.messages.fetch(message.reference.messageId);
        isReplyToBot = refMsg.author.id === client.user.id;
      } catch {
        isReplyToBot = false;
      }
    }

    if (message.mentions.has(client.user) || isReplyToBot) {
      const sent = await replyWithControl(
        message,
        'mention',
        'mention_group',
        RESPUESTAS.mention,
        MENTION_REPLY_PROBABILITY
      );
      if (sent) return;
    }

    /* ===== SALUDOS ===== */
    if (/(^|\s)(hola|buen[oa]s?\s?(d[ií]as?|tardes?|noches?)|qué onda|que onda|q onda)(\s|$)/.test(texto)) {
      const horaUTC = new Date().getUTCHours();
      const hora = (horaUTC + 18) % 24;

      const grupo =
        hora >= 5 && hora < 12
          ? RESPUESTAS.saludoManana
          : hora >= 12 && hora < 20
          ? RESPUESTAS.saludoTarde
          : RESPUESTAS.saludoNoche;

      const sent = await replyWithControl(
        message,
        'saludo',
        'saludo_group',
        grupo
      );
      if (sent) return;
    }

    /* ===== ALBURES / RESPUESTAS ===== */
    if (/([bv]erga|pito|pitillo|pene|nepe)\b/.test(texto)) {
      const sent = await replyWithControl(
        message,
        'erga',
        'erga_group',
        RESPUESTAS.erga
      );
      if (sent) return;
    }

    if (/\b(13|12\+1|10\+3|trece|trese)\b/.test(texto)) {
      const sent = await replyWithControl(
        message,
        'trece',
        'trece_group',
        RESPUESTAS.trece
      );
      if (sent) return;
    }

    if (/\b(5|cinco|cinquito|quinto|3\+2)\b/.test(texto)) {
      const sent = await replyWithControl(
        message,
        'cinco',
        'cinco_group',
        RESPUESTAS.cinco
      );
      if (sent) return;
    }

    if (/(no quiero trabajar|tengo sueño|ya me quiero ir|que hueva|qué hueva|que flojera|qué flojera|ando cansado|ya me cansé|me da flojera|odio los lunes)/.test(texto)) {
      const sent = await replyWithControl(
        message,
        'hueva',
        'hueva_group',
        RESPUESTAS.hueva
      );
      if (sent) return;
    }

    if (/(calor|calorcito|me estoy derritiendo|estoy sudando)/.test(texto)) {
      const sent = await replyWithControl(
        message,
        'calor',
        'calor_group',
        RESPUESTAS.calor
      );
      if (sent) return;
    }

    if (/(frio|frío|friecito|me congelo|me estoy congelando)/.test(texto)) {
      const sent = await replyWithControl(
        message,
        'frio',
        'frio_group',
        RESPUESTAS.frio
      );
      if (sent) return;
    }

    if (/(blanco|blanquito|color blanco|tan blanco)/.test(texto)) {
      const sent = await replyWithControl(
        message,
        'blanco',
        'blanco_group',
        RESPUESTAS.blanco
      );
      if (sent) return;
    }

    if (/([bh]uevos|tanates|testiculos|[hb]uevitos)/.test(texto)) {
      const sent = await replyWithControl(
        message,
        'huevos',
        'huevos_group',
        RESPUESTAS.huevos
      );
      if (sent) return;
    }

    if (/\bsed\b/.test(texto)) {
      const sent = await replyWithControl(
        message,
        'sed',
        'sed_group',
        RESPUESTAS.sed
      );
      if (sent) return;
    }

    /* ===== ANTIFLOOD ===== */
    const key = `${message.channel.id}-${message.author.id}`;
    const last = state.userMessageCounts.get(key) || { count: 0 };
    last.count += 1;
    state.userMessageCounts.set(key, last);

    try {
      const messages = await message.channel.messages.fetch({ limit: 2 });
      const msgs = Array.from(messages.values());
      if (msgs.length >= 2 && msgs[1].author.id !== message.author.id) {
        state.userMessageCounts.set(`${message.channel.id}-${msgs[1].author.id}`, { count: 0 });
      }
    } catch {
      // ignore
    }

    if (last.count >= 6) {
      const sent = await replyWithControl(
        message,
        'flood',
        'flood_group',
        RESPUESTAS.flood,
        FLOOD_REPLY_PROBABILITY
      );

      if (sent) {
        state.userMessageCounts.set(key, { count: 0 });
        return;
      }
    }
  } catch (err) {
    console.error('Error en messageCreate:', err);
  }
});

/* =========================
   MENSAJES BORRADOS
   (esto sí responde siempre)
========================= */
client.on('messageDelete', async (message) => {
  try {
    if (!message || message.author?.bot || !message.channel) return;

    const msg = pickRandom('delete_group', RESPUESTAS.deleted);

    if (message.author?.id) {
      await message.channel.send(`<@${message.author.id}> ${msg}`);
    } else {
      await message.channel.send(msg);
    }
  } catch (err) {
    console.error('Error en messageDelete:', err);
  }
});

/* =========================
   LOGIN
========================= */
console.log('🚀 Intentando iniciar sesión con Discord...');
client.login(process.env.TOKEN)
  .then(() => console.log('🔐 Login a Discord enviado'))
  .catch(err => console.error('❌ Error al iniciar sesión con Discord:', err));
