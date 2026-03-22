import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from "@whiskeysockets/baileys";

import pino from "pino";
import qrcode from "qrcode-terminal";

import * as productService from "../services/productService.js";
import Chat from "../models/Chats.js";
import {
  isRequestingMenu,
  getMenuResponse,
  buildPrompt,
  generateAIResponse,
} from "../services/aiServices.js";

// ==========================
// Helper kirim pesan
// ==========================
async function sendWhatsAppText(sock, to, text) {
  await sock.sendMessage(to, { text });
}

async function sendWhatsAppImage(sock, to, imageUrl, caption) {
  await sock.sendMessage(to, {
    image: { url: imageUrl },
    caption: caption,
  });
}

// ==========================
// Helper simpan chat (HEMAT DB)
// ==========================
async function saveMessage(userId, role, content) {
  let chat = await Chat.findOne({ userId });

  if (!chat) {
    chat = new Chat({
      userId,
      messages: [],
    });
  }

  chat.messages.push({
    role,
    content,
  });

  // 🔥 Batasi hanya 10 chat terakhir
  chat.messages = chat.messages.slice(-10);

  chat.updatedAt = new Date();

  await chat.save();

  return chat.messages;
}

// ==========================
// MAIN BOT
// ==========================
async function startBot() {
  console.log("📱 Bot initializing...");

  const { state, saveCreds } = await useMultiFileAuthState("session");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    auth: state,
  });

  sock.ev.on("creds.update", saveCreds);

  // ==========================
  // CONNECTION HANDLER
  // ==========================
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("📱 Scan QR:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("✅ Connected to WhatsApp!");
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      console.log("❌ Connection closed. Reconnecting:", shouldReconnect);

      if (shouldReconnect) {
        startBot();
      }
    }
  });

  // ==========================
  // MESSAGE HANDLER
  // ==========================
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message) return;
    if (msg.key.fromMe) return;

    const text =
      msg.message.conversation || msg.message.extendedTextMessage?.text;

    if (!text) return;

    console.log("📩 User:", text);

    const userId = msg.key.remoteJid;

    try {
      // ✅ simpan user message + ambil history
      const chats = await saveMessage(userId, "user", text);

      const products = await productService.getAllProducts();

      const requestingMenu = await isRequestingMenu(text, products, chats);

      if (requestingMenu) {
        const menu = getMenuResponse();

        await sendWhatsAppImage(sock, userId, menu.imageUrl, menu.text);

        // simpan balasan bot
        await saveMessage(userId, "assistant", menu.text);
      } else {
        const prompt = await buildPrompt(text, products, chats);
        const aiReply = await generateAIResponse(prompt);

        // simpan balasan bot
        await saveMessage(userId, "assistant", aiReply);

        await sendWhatsAppText(sock, userId, aiReply);
      }
    } catch (err) {
      console.error("❌ ERROR:", err);
    }
  });
}

export default startBot;
