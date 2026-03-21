import axios from "axios";

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
