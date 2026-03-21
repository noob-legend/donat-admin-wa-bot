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
import { buildPrompt, generateAIResponse } from "../services/aiServices.js";

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

    const userId = msg.key.remoteJid;

    try {
      // Save user message
      await new Chat({ userId, message: text, isUser: true }).save();

      const products = await productService.getAllProducts();
      const chats = await Chat.find({ userId }).sort({ timestamp: -1 }).limit(10);

      const prompt = buildPrompt(text, products, chats);
      const aiReply = await generateAIResponse(prompt);

      // Save admin reply
      await new Chat({ userId, message: aiReply, isUser: false }).save();

      await sock.sendMessage(msg.key.remoteJid, {
        text: aiReply,
      });
    } catch (err) {
      console.error("ERROR:", err);
    }
  });
}

export default startBot;
