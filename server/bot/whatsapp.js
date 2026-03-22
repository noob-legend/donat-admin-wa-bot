import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { DisconnectReason } from "@whiskeysockets/baileys";

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

// Tambahkan fungsi untuk kirim teks dan gambar
async function sendWhatsAppText(sock, to, text) {
  await sock.sendMessage(to, { text });
}

async function sendWhatsAppImage(sock, to, imageUrl, caption) {
  await sock.sendMessage(to, {
    image: { url: imageUrl },
    caption: caption,
  });
}

async function startBot() {
  console.log("📱 Bot initializing...");

  const { state, saveCreds } = await useMultiFileAuthState("session");

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: "info" }),
    auth: state,
  });

  sock.ev.on("creds.update", saveCreds);

  // ✅ WAJIB ADA INI
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
        startBot(); // 🔥 reconnect otomatis
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message) return;
    if (msg.key.fromMe) return;

    const text =
      msg.message.conversation || msg.message.extendedTextMessage?.text;

    if (!text) return;

    console.log("📩 User:", text);

    const userId = msg.key.remoteJid; // ini nomor WA user

    try {
      // Save user message
      await new Chat({ userId, message: text, isUser: true }).save();

      const products = await productService.getAllProducts();
      const chats = await Chat.find({ userId })
        .sort({ timestamp: -1 })
        .limit(10);

      // 🔥 PERBAIKAN: tambahkan AWAIT karena isRequestingMenu sekarang ASYNC
      const requestingMenu = await isRequestingMenu(text, products, chats);

      if (requestingMenu) {
        // Kalau user minta menu, kirim foto + teks
        const menu = getMenuResponse();

        // Kirim foto ke WhatsApp (pakai sock)
        await sendWhatsAppImage(sock, userId, menu.imageUrl, menu.text);

        // Simpan respons ke database
        await new Chat({ userId, message: menu.text, isUser: false }).save();
      } else {
        // Kalau bukan minta menu, proses seperti biasa pakai AI
        const prompt = buildPrompt(text, products, chats);
        const aiReply = await generateAIResponse(prompt);

        // Save admin reply
        await new Chat({ userId, message: aiReply, isUser: false }).save();

        // Kirim balasan teks
        await sendWhatsAppText(sock, userId, aiReply);
      }
    } catch (err) {
      console.error("ERROR:", err);
    }
  });
}

export default startBot;
