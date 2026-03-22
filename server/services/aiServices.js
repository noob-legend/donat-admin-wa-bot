import axios from "axios";
import dotenv from "dotenv";
import DataTraining from "../models/DataTraining.js";

dotenv.config();
const MENU_IMAGE_URL = process.env.MENU_IMAGE_URL; // ganti dengan URL asli

export const buildPrompt = async (userMessage, products, chats) => {
  // 🔥 ambil training (batasi biar hemat token)
  const trainings = await DataTraining.find({ isActive: true }).limit(20);

  // 🔥 format chat history (pakai schema baru)
  const conversationHistory = chats
    .map((chat) =>
      chat.role === "user" ? `User: ${chat.content}` : `Admin: ${chat.content}`,
    )
    .join("\n");

  return `
Kamu adalah admin toko donat.
Gunakan bahasa santai, ramah, dan gunakan kata "kak".

ATURAN:
- Fokus hanya pada donat
- Jangan jawab di luar konteks
- Jawaban singkat, jelas, dan natural
- Prioritaskan membantu user untuk membeli
- Gunakan gaya seperti admin jualan

DATA TRAINING:
${JSON.stringify(trainings)}

DATA PRODUK:
${JSON.stringify(products)}

RIWAYAT PERCAKAPAN:
${conversationHistory}

PANDUAN MENJAWAB:
1. Cek apakah pertanyaan user mirip dengan DATA TRAINING
2. Jika mirip → gunakan atau modifikasi jawaban dari training
3. Jika tidak → gunakan DATA PRODUK
4. Jika tetap tidak relevan → jawab sopan hanya melayani donat

USER:
${userMessage}

Jawab sebagai admin toko donat:
`;
};

export const generateAIResponse = async (prompt) => {
  try {
    const response = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      {
        model: "deepseek-chat",

        messages: [
          {
            role: "system",
            content:
              "Kamu adalah admin toko donat yang ramah, santai, dan fokus membantu user membeli.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],

        temperature: 0.6, // 🔥 lebih stabil (tidak ngawur)
        max_tokens: 300, // 🔥 batasi biar hemat
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 10000, // 🔥 anti ngegantung
      },
    );

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error("DeepSeek Error:", error.response?.data || error.message);

    return "Maaf kak, lagi ada gangguan 🙏 coba lagi sebentar ya";
  }
};

// ============ FITUR DETEKSI MENU PAKAI AI ============

// Fungsi untuk mengecek apakah user minta menu (pakai AI)
export const isRequestingMenu = async (userMessage, products, chats) => {
  // 🔥 1. FAST CHECK (tanpa AI)
  const fastResult = fastMenuDetection(userMessage);
  if (fastResult !== null) return fastResult;

  // 🔥 2. Kalau ragu baru pakai AI
  const prompt = `
Anda adalah classifier intent untuk toko donat.

Tugas: Tentukan apakah user ingin melihat MENU.

Kriteria:
- "menu", "katalog", "daftar", typo tetap dianggap menu
- sapaan = bukan menu
- tanya harga = bukan menu

Jawab HANYA JSON:
{"isRequestingMenu": true/false}
  
User: "${userMessage}"
`;

  try {
    const response = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      {
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: "Kamu hanya menjawab JSON valid.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0,
        max_tokens: 50,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 8000,
      },
    );

    const content = response.data.choices[0].message.content.trim();

    try {
      const parsed = JSON.parse(content);
      return parsed.isRequestingMenu === true;
    } catch {
      return false;
    }
  } catch (error) {
    console.error("Intent detection error:", error.message);

    // 🔥 fallback terakhir
    return fallbackMenuDetection(userMessage);
  }
};

// ==========================
// FAST DETECTION (WAJIB 🔥)
// ==========================
const fastMenuDetection = (userMessage) => {
  const msg = userMessage.toLowerCase();

  // 🔥 langsung TRUE
  const strongKeywords = [
    "menu",
    "lihat menu",
    "katalog",
    "daftar menu",
    "list menu",
  ];

  if (strongKeywords.some((k) => msg.includes(k))) return true;

  // 🔥 langsung FALSE
  const negativeKeywords = [
    "halo",
    "hai",
    "pagi",
    "siang",
    "malam",
    "terima kasih",
    "makasih",
  ];

  if (negativeKeywords.some((k) => msg.includes(k))) return false;

  // 🔥 typo handling ringan
  if (msg.includes("manu") || msg.includes("ketelog")) return true;

  // 🔥 kalau gak yakin → biar AI yang handle
  return null;
};

// ==========================
// FALLBACK
// ==========================
const fallbackMenuDetection = (userMessage) => {
  const msg = userMessage.toLowerCase();

  const simpleKeywords = ["menu", "katalog", "daftar", "manu", "ketelog"];

  return simpleKeywords.some((k) => msg.includes(k));
};

// ==========================
// RESPONSE MENU
// ==========================
export const getMenuResponse = () => {
  return {
    text: `🍩 *MENU DONAT KAMI* 🍩

Ini dia menu lengkapnya kak, silakan lihat di gambar ya 😊

Harga:
• Donat Reguler: Rp 6.000
• Donat Premium: Rp 7.000 - Rp 8.000

Ketik nama donat untuk tanya stok atau langsung pesan dengan format:
"tambah [nama donat] [jumlah]"

Contoh: "tambah donat coklat 2"`,
    imageUrl: process.env.MENU_IMAGE_URL,
  };
};
