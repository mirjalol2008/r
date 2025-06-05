import { Telegraf, Markup } from 'telegraf';
import Chess from 'chess.js'; // npm install chess.js

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('BOT_TOKEN environment variable is missing!');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

const games = {}; // { chatId: { chess: Chess(), players: { white: userId, black: userId }, turn: 'w' } }
const challenges = {}; // { chatId: { from: userId, to: userId } }

// /challenge komandasi
bot.command('challenge', async (ctx) => {
  if (!ctx.message.reply_to_message && ctx.message.entities.length < 2) {
    return ctx.reply('Iltimos, jangga chaqirish uchun /challenge @username yoki reply qiling.');
  }

  let toUser = null;
  if (ctx.message.reply_to_message) {
    toUser = ctx.message.reply_to_message.from;
  } else {
    // username'dan userni aniqlash mumkin emas Telegram APIda, faqat reply orqali
    return ctx.reply('Iltimos, jangga chaqirish uchun foydalanuvchini reply qiling.');
  }

  if (toUser.id === ctx.from.id) {
    return ctx.reply('O‘zingizni jangga chaqira olmaysiz!');
  }

  const chatId = ctx.chat.id;
  if (games[chatId]) {
    return ctx.reply('Bu guruhda allaqachon o‘yin davom etmoqda.');
  }

  challenges[chatId] = { from: ctx.from.id, to: toUser.id };

  const inlineKeyboard = Markup.inlineKeyboard([
    Markup.button.callback('Qabul qilaman', `accept_${ctx.from.id}_${toUser.id}`),
    Markup.button.callback('Rad qilaman', `decline_${ctx.from.id}_${toUser.id}`)
  ]);

  await ctx.replyWithMarkdown(`@${toUser.username}, sizga @${ctx.from.username} tomonidan shaxmat o‘ynashga chaqiriq!`, inlineKeyboard);
});

// Inline tugma callback
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const chatId = ctx.chat.id;
  if (data.startsWith('accept_')) {
    const [_, fromId, toId] = data.split('_');
    if (ctx.from.id.toString() !== toId) {
      return ctx.answerCbQuery('Bu tugma siz uchun emas!');
    }

    if (!challenges[chatId] || challenges[chatId].from.toString() !== fromId || challenges[chatId].to.toString() !== toId) {
      return ctx.answerCbQuery('Chaqiriq topilmadi yoki amal qilish muddati tugagan.');
    }

    // O‘yin boshlash
    const chess = new Chess();
    games[chatId] = {
      chess,
      players: { white: parseInt(fromId), black: parseInt(toId) },
      turn: 'w'
    };
    delete challenges[chatId];

    await ctx.editMessageText('O‘yin boshlandi! White (@'+ctx.from.username + ') boshlaydi.');
    sendBoard(chatId);
  }
  else if (data.startsWith('decline_')) {
    const [_, fromId, toId] = data.split('_');
    if (ctx.from.id.toString() !== toId) {
      return ctx.answerCbQuery('Bu tugma siz uchun emas!');
    }
    delete challenges[chatId];
    await ctx.editMessageText('Chaqiriq rad etildi.');
  }
  else if (data.startsWith('move_')) {
    // Harakat kodi: move_e2e4
    if (!games[chatId]) return ctx.answerCbQuery('O‘yin topilmadi.');
    const chessGame = games[chatId].chess;
    const move = data.split('_')[1];
    const playerId = ctx.from.id;

    const isWhiteTurn = chessGame.turn() === 'w';
    const currentPlayerId = isWhiteTurn ? games[chatId].players.white : games[chatId].players.black;

    if (playerId !== currentPlayerId) {
      return ctx.answerCbQuery('Hozir sizning navbingiz emas.');
    }

    const result = chessGame.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: 'q' });

    if (result === null) {
      return ctx.answerCbQuery('Noto‘g‘ri yurish.');
    }

    if (chessGame.game_over()) {
      let resultText = 'O‘yin tugadi: ';
      if (chessGame.in_checkmate()) resultText += 'Mat, g‘olib — @' + ctx.from.username;
      else if (chessGame.in_stalemate()) resultText += 'Durrang (stalemate)';
      else if (chessGame.in_threefold_repetition()) resultText += 'Durrang (takrorlash)';
      else if (chessGame.insufficient_material()) resultText += 'Durrang (material yetarli emas)';
      else resultText += 'O‘yin yakunlandi.';

      delete games[chatId];
      await ctx.editMessageText(resultText);
      return;
    }

    games[chatId].turn = chessGame.turn();
    await ctx.answerCbQuery('Yurish qabul qilindi.');

    sendBoard(chatId);
  }
  else {
    await ctx.answerCbQuery('Noma\'lum amal.');
  }
});

// Taxtani matn ko‘rinishida yuborish
async function sendBoard(chatId) {
  if (!games[chatId]) return;

  const chessGame = games[chatId].chess;
  const fen = chessGame.fen();
  const board = chessGame.ascii();

  // Harakatlarni inline tugmalar bilan yuborish uchun har bir oq yoki qora figuraning yurishlarini inline tugmaga aylantirish lozim.
  // Bu qiyin, shuning uchun hozircha faqat ASCII taxta va keyingi qadamlar uchun info beramiz.

  await bot.telegram.sendMessage(chatId, `\`\`\`\n${board}\n\`\`\``, { parse_mode: 'Markdown' });

  await bot.telegram.sendMessage(chatId, `Navbat: ${chessGame.turn() === 'w' ? 'White' : 'Black'}`);
}

bot.launch();
console.log('Chess bot ishga tushdi.');