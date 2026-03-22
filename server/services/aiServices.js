import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
const MENU_IMAGE_URL = process.env.MENU_IMAGE_URL; // ganti dengan URL asli

export const buildPrompt = (userMessage, products, chats) => {
  // Format chats as conversation history
  const conversationHistory = chats
    .sort((a, b) => a.timestamp - b.timestamp) // oldest first
    .map((chat) =>
      chat.isUser ? `User: ${chat.message}` : `Admin: ${chat.message}`,
    )
    .join("\n");

  return `
Kamu adalah admin toko donat.
Gunakan bahasa santai, ramah, gunakan kata "kak".

ATURAN:
- Fokus hanya pada donat
- Jangan jawab di luar konteks
- Gunakan gaya seperti contoh

DATA PRODUK:
${JSON.stringify(products)}

RIWAYAT PERCAKAPAN:
${conversationHistory}

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
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error("DeepSeek Error:", error.response?.data || error.message);
    return "Maaf kak, lagi ada gangguan 🙏";
  }
};

// ============ FITUR DETEKSI MENU PAKAI AI ============

// Fungsi untuk mengecek apakah user minta menu (pakai AI)
export const isRequestingMenu = async (userMessage, products, chats) => {
  const prompt = `
Anda adalah classifier intent untuk toko donat.
Tugas: Tentukan apakah user sedang MEMINTA MENU (melihat daftar donat) atau tidak.

Berikut data:
- Produk toko: ${JSON.stringify(products)}
- Riwayat chat: ${chats
    .slice(-3)
    .map((c) => `${c.isUser ? "User" : "Admin"}: ${c.message}`)
    .join("\n")}
- Pesan user saat ini: "${userMessage}"

Analisis: Apakah user ingin melihat menu donat?
- Meskipun ada typo seperti "manu", "ketelog", "daptar menu", tetap dianggap MEMINTA MENU
- Jika user hanya menyapa seperti "hai", "halo", "pagi", itu BUKAN minta menu
- Jika user nanya harga tapi tidak minta menu, itu BUKAN minta menu

Jawab hanya dengan format JSON:
{ "isRequestingMenu": true/false, "reason": "alasan singkat" }
`;

  try {
    const response = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      {
        model: "deepseek-chat",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1, // rendah agar konsisten
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    const aiResponse = response.data.choices[0].message.content;

    // Parse JSON dari response AI
    const jsonMatch = aiResponse.match(/\{.*\}/s);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return result.isRequestingMenu === true;
    }

    return false;
  } catch (error) {
    console.error("Intent detection error:", error);
    // Fallback ke keyword sederhana kalau AI error
    return fallbackMenuDetection(userMessage);
  }
};

// Fallback sederhana (kalau AI error)
const fallbackMenuDetection = (userMessage) => {
  const msg = userMessage.toLowerCase();
  const simpleKeywords = [
    "menu",
    "katalog",
    "daftar",
    "manu",
    "ketelog",
    "lihat menu",
  ];
  return simpleKeywords.some((keyword) => msg.includes(keyword));
};

export const getMenuResponse = () => {
  return {
    text: '🍩 *MENU DONAT KAMI* 🍩\n\nIni dia menu lengkapnya kak, silakan lihat di gambar ya 😊\n\nHarga:\n• Donat Reguler: Rp 6.000\n• Donat Premium: Rp 7.000 - Rp 8.000\n\nKetik nama donat untuk tanya stok atau langsung pesan dengan format:\n"tambah [nama donat] [jumlah]"\n\nContoh: "tambah donat coklat 2"',
    imageUrl: MENU_IMAGE_URL,
  };
};
