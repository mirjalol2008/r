import dotenv from 'dotenv';
dotenv.config();

import { Telegraf, Markup } from 'telegraf';
import { Chess } from 'chess.js';

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
  if (!ctx.message.reply_to_message) {
    return ctx.reply('Iltimos, jangga chaqirish uchun /challenge komandasi bilan foydalanuvchini reply qiling.');
  }

  const toUser = ctx.message.reply_to_message.from;

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

    await ctx.editMessageText('O‘yin boshlandi! White (@' + ctx.from.username + ') boshlaydi.');
    await sendBoard(chatId);
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
    if (!games[chatId]) return ctx.answerCbQuery('O‘yin topilmadi.');
    const chessGame = games[chatId].chess;
    const move = data.slice(5); // move_ dan keyingi qism, masalan e2e4
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

    if (chessGame.isGameOver()) {
      let resultText = 'O‘yin tugadi: ';
      if (chessGame.isCheckmate()) resultText += 'Mat, g‘olib — @' + ctx.from.username;
      else if (chessGame.isStalemate()) resultText += 'Durrang (stalemate)';
      else if (chessGame.isThreefoldRepetition()) resultText += 'Durrang (takrorlash)';
      else if (chessGame.isInsufficientMaterial()) resultText += 'Durrang (material yetarli emas)';
      else resultText += 'O‘yin yakunlandi.';

      delete games[chatId];
      await ctx.editMessageText(resultText);
      return;
    }

    games[chatId].turn = chessGame.turn();
    await ctx.answerCbQuery('Yurish qabul qilindi.');

    await sendBoard(chatId);
  }
  else {
    await ctx.answerCbQuery('Noma\'lum amal.');
  }
});

// Taxtani va yurish tugmalarini inline keyboard bilan yuborish
async function sendBoard(chatId) {
  if (!games[chatId]) return;

  const chessGame = games[chatId].chess;
  const board = chessGame.ascii();

  // ASCII taxta yuborish
  await bot.telegram.sendMessage(chatId, `\`\`\`\n${board}\n\`\`\``, { parse_mode: 'Markdown' });

  // Mavjud yurishlarni olish
  const moves = chessGame.moves({ verbose: true });

  // Tugmalarni yaratish
  const buttons = moves.map(move => {
    const moveCode = `move_${move.from}${move.to}`;
    return Markup.button.callback(`${move.from}${move.to}`, moveCode);
  });

  // Tugmalarni 4 tadan qatorlarga ajratamiz
  const chunkSize = 4;
  const keyboard = [];
  for (let i = 0; i < buttons.length; i += chunkSize) {
    keyboard.push(buttons.slice(i, i + chunkSize));
  }

  // Navbat kimda ekanini chiqaramiz
  const turnText = `Navbat: ${chessGame.turn() === 'w' ? 'White' : 'Black'}`;

  await bot.telegram.sendMessage(chatId, turnText, Markup.inlineKeyboard(keyboard));
}

bot.launch();
console.log('Chess bot ishga tushdi.');
