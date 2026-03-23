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
import Payment from "../models/Payment.js";
import Cart from "../models/Cart.js";
import {
  isRequestingMenu,
  getMenuResponse,
  buildPrompt,
  generateAIResponse,
} from "../services/aiServices.js";
import {
  createQRPayment,
  checkPaymentStatus,
  formatPaymentResponse,
  cancelPayment,
  generateQRCodeImage,
} from "../services/midtransServices.js";

// ==========================
// Helper kirim pesan
// ==========================
async function sendWhatsAppText(sock, to, text) {
  try {
    await sock.sendMessage(to, { text });
  } catch (error) {
    console.error("Error sending text:", error);
  }
}

async function sendWhatsAppImage(sock, to, imageUrlOrData, caption) {
  try {
    const imagePayload =
      typeof imageUrlOrData === "string" &&
      imageUrlOrData.startsWith("data:image")
        ? { url: imageUrlOrData }
        : { url: imageUrlOrData };

    await sock.sendMessage(to, {
      image: imagePayload,
      caption: caption,
    });
  } catch (error) {
    console.error("Error sending image:", error);
    // Fallback ke text jika image gagal
    await sendWhatsAppText(sock, to, caption);
  }
}

// ==========================
// Helper simpan chat (HEMAT DB)
// ==========================
async function saveMessage(userId, role, content) {
  try {
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
  } catch (error) {
    console.error("Error saving message:", error);
    return [];
  }
}

// ==========================
// CART SERVICES (Database)
// ==========================
async function getCart(userId) {
  try {
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({
        userId,
        items: [],
        total: 0,
      });
      await cart.save();
    }
    return cart;
  } catch (error) {
    console.error("Error getting cart:", error);
    return { userId, items: [], total: 0 };
  }
}

async function addToCart(userId, product, quantity) {
  try {
    let cart = await getCart(userId);

    const existingItem = cart.items.find(
      (item) => item.productId.toString() === product._id.toString(),
    );

    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      cart.items.push({
        productId: product._id,
        productName: product.nama,
        quantity: quantity,
        unitPrice: product.harga,
      });
    }

    // Recalculate total
    cart.total = cart.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );

    cart.updatedAt = new Date();
    await cart.save();

    return cart;
  } catch (error) {
    console.error("Error adding to cart:", error);
    throw error;
  }
}

async function clearCart(userId) {
  try {
    await Cart.findOneAndDelete({ userId });
  } catch (error) {
    console.error("Error clearing cart:", error);
  }
}

async function removeFromCart(userId, productId) {
  try {
    let cart = await getCart(userId);
    cart.items = cart.items.filter(
      (item) => item.productId.toString() !== productId.toString(),
    );
    cart.total = cart.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );
    cart.updatedAt = new Date();
    await cart.save();
    return cart;
  } catch (error) {
    console.error("Error removing from cart:", error);
    throw error;
  }
}

async function updateCartItemQuantity(userId, productId, quantity) {
  try {
    let cart = await getCart(userId);
    const item = cart.items.find(
      (item) => item.productId.toString() === productId.toString(),
    );
    if (item) {
      if (quantity <= 0) {
        return await removeFromCart(userId, productId);
      }
      item.quantity = quantity;
      cart.total = cart.items.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0,
      );
      cart.updatedAt = new Date();
      await cart.save();
    }
    return cart;
  } catch (error) {
    console.error("Error updating cart item:", error);
    throw error;
  }
}

function formatCartMessage(cart) {
  if (cart.items.length === 0) {
    return "🛒 *Keranjang Belanja Kosong*\n\nKetik *tambah [nama donat] [jumlah]* untuk mulai berbelanja.\n\nContoh: *tambah donat coklat 2*";
  }

  const itemsList = cart.items.map(
    (item, index) =>
      `${index + 1}. *${item.productName}*\n   ${item.quantity} x Rp${item.unitPrice.toLocaleString()} = Rp${(
        item.unitPrice * item.quantity
      ).toLocaleString()}`,
  );

  return `🛒 *KERANJANG BELANJA*\n\n${itemsList.join("\n\n")}\n\n──────────────────\n*TOTAL: Rp${cart.total.toLocaleString()}*\n\nKetik *bayar* untuk checkout, atau *menu* untuk lihat produk.`;
}

// ==========================
// ORDER PARSING
// ==========================

function normalizeProductText(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\bcoklat\b/g, "cokelat")
    .replace(/\bdonat\b/g, "")
    .trim();
}

function levenshteinDistance(a, b) {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) =>
    Array(a.length + 1).fill(0),
  );

  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[j][i] = matrix[j - 1][i - 1];
      } else {
        matrix[j][i] = Math.min(
          matrix[j - 1][i] + 1,
          matrix[j][i - 1] + 1,
          matrix[j - 1][i - 1] + 1,
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function findProductByName(products, searchName) {
  const normalizedSearch = normalizeProductText(searchName);

  let bestMatch = null;
  let bestDistance = Number.MAX_SAFE_INTEGER;

  for (const product of products) {
    const normalizedProduct = normalizeProductText(product.nama);

    if (
      normalizedProduct.includes(normalizedSearch) ||
      normalizedSearch.includes(normalizedProduct)
    ) {
      return product;
    }

    const distance = levenshteinDistance(normalizedProduct, normalizedSearch);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = product;
    }
  }

  // Toleransi typo: terima jika distance relatif kecil
  if (bestDistance <= 4) {
    return bestMatch;
  }

  return null;
}

function parseOrderFromMessage(text, products) {
  const lowerText = text.toLowerCase().trim();

  // Pattern matching untuk berbagai format
  const patterns = [
    // Format: "tambah donat coklat 2", "mau donat cokelat 2", "saya mau 2 coklat"
    {
      regex: /(?:tambah|add|pesan|order|beli|mau|ambil)?\s*([^0-9]+?)\s+(\d+)/i,
      getDetails: (match) => ({ name: match[1], quantity: parseInt(match[2]) }),
    },
    // Format: "2 donat coklat", "2 coklat"
    {
      regex: /^(\d+)\s+(.+?)$/i,
      getDetails: (match) => ({ name: match[2], quantity: parseInt(match[1]) }),
    },
    // Format: "donat coklat 2", "coklat 2"
    {
      regex: /^(.+?)\s+(\d+)$/i,
      getDetails: (match) => ({ name: match[1], quantity: parseInt(match[2]) }),
    },
  ];

  // Daftar kata kunci pesanan (untuk bahasa natural)
  const orderKeywords = [
    "tambah",
    "add",
    "pesan",
    "order",
    "beli",
    "mau",
    "ambil",
  ];

  // Cek apakah ini pesanan dengan keyword atau pola jumlah produk
  const isOrder =
    orderKeywords.some((keyword) => lowerText.includes(keyword)) ||
    patterns.some((pattern) => pattern.regex.test(lowerText));

  if (!isOrder) return null;

  let matched = null;
  let details = null;

  for (const pattern of patterns) {
    const match = lowerText.match(pattern.regex);
    if (match) {
      matched = match;
      details = pattern.getDetails(match);
      break;
    }
  }

  if (!details) return null;

  // Bersihkan nama donat dari kata-kata tambahan
  let donatName = details.name
    .trim()
    .replace(/\s+(ya|yak|kak|tolong|mohon|makasih|please|bang|mas|mbak)$/i, "")
    .replace(/\b(donat)\s+/i, "") // Hapus kata "donat" jika ada
    .trim();

  if (!donatName || details.quantity <= 0) return null;

  // Cari produk yang cocok dengan toleransi typo (coklat/cokelat, dsb.)
  const product = findProductByName(products, donatName);

  if (!product) {
    return { error: `Donat "${donatName}" tidak ditemukan` };
  }

  return {
    product,
    quantity: details.quantity,
    donatName,
  };
}

// ==========================
// PAYMENT HANDLER (UPDATED)
// ==========================
async function handlePayment(sock, userId, cart) {
  if (cart.items.length === 0) {
    const reply =
      "❌ *Keranjang Kosong*\n\nKetik *tambah [nama donat] [jumlah]* dulu ya, lalu ketik *bayar*.";
    await sendWhatsAppText(sock, userId, reply);
    await saveMessage(userId, "assistant", reply);
    return false;
  }

  const amount = cart.total;

  try {
    // Buat pembayaran QRIS dengan order ID custom
    const orderId = `order-${userId.replace(/[^0-9]/g, "")}-${Date.now()}`;
    const payment = await createQRPayment(amount, orderId);

    // Simpan ke DB dengan data lengkap
    await Payment.create({
      userId,
      orderId: payment.orderId,
      transactionId: payment.transactionId,
      amount: payment.amount || amount,
      status: "pending",
      expiry: payment.expiry,
    });

    // Format payment response untuk user
    const paymentResult = {
      status: payment.status || "pending",
      amount: payment.amount || amount,
      orderId: payment.orderId,
      transactionId: payment.transactionId,
    };

    const formattedResponse = formatPaymentResponse(paymentResult);

    const paymentText = `💳 *PEMBAYARAN QRIS*\n\n${formattedResponse.message}\n\n⏱️ QR Code berlaku hingga: ${new Date(payment.expiry).toLocaleString("id-ID")}\n\n*Order ID:* ${payment.orderId}\n\nScan QR code di bawah untuk membayar:`;

    if (!payment.qrUrl) {
      const errorText =
        "❌ Maaf, terjadi kesalahan: URL pembayaran tidak tersedia. Silakan coba lagi.";
      console.error("Missing QRIS URL in payment response:", payment);
      await sendWhatsAppText(sock, userId, errorText);
      await saveMessage(userId, "assistant", errorText);
      return false;
    }

    // Kirim QR code
    console.log("📱 Order ID:", payment.orderId);
    console.log("🔗 Deeplink URL:", payment.qrUrl);
    console.log("⏰ Expiry:", payment.expiry);

    let qrPayload = payment.qrUrl;

    try {
      const qrBase64 = await generateQRCodeImage(payment.qrUrl);
      if (qrBase64) {
        qrPayload = `data:image/png;base64,${qrBase64}`;
      }
    } catch (err) {
      console.warn(
        "Warning: generateQRCodeImage gagal, fallback ke qris URL:",
        err.message,
      );
    }

    await sendWhatsAppImage(sock, userId, qrPayload, paymentText);

    // Simpan balasan bot
    await saveMessage(userId, "assistant", paymentText);

    // Kosongkan cart setelah checkout
    await clearCart(userId);

    return true;
  } catch (error) {
    console.error("Error creating payment:", error);
    const errorMsg =
      "❌ Maaf, terjadi kesalahan saat memproses pembayaran. Silakan coba lagi.\n\n" +
      "Jika masalah berlanjut, hubungi admin.";
    await sendWhatsAppText(sock, userId, errorMsg);
    await saveMessage(userId, "assistant", errorMsg);
    return false;
  }
}

// ==========================
// CHECK PENDING PAYMENT (UPDATED)
// ==========================
async function checkPendingPayment(sock, userId, pendingPayment) {
  try {
    const paymentStatus = await checkPaymentStatus(pendingPayment.orderId);

    console.log(
      `📊 Payment check for ${pendingPayment.orderId}:`,
      paymentStatus,
    );

    // Format response menggunakan helper
    const formattedResponse = formatPaymentResponse(paymentStatus);

    const statusValue =
      paymentStatus?.status || paymentStatus?.transactionStatus || "pending";

    if (statusValue === "settlement" || statusValue === "capture") {
      // Update status di database
      await Payment.findByIdAndUpdate(pendingPayment._id, {
        status: "success",
        transactionId: paymentStatus.transactionId,
        paymentType: paymentStatus.paymentType,
      });

      const successMsg =
        "✅ *PEMBAYARAN BERHASIL!*\n\n" +
        `Terima kasih telah berbelanja sebesar Rp${(paymentStatus.amount || pendingPayment.amount).toLocaleString()}.\n\n` +
        "Pesanan Anda akan segera diproses. 😊\n\n" +
        `*Order ID:* ${pendingPayment.orderId}`;

      await sendWhatsAppText(sock, userId, successMsg);
      await saveMessage(userId, "assistant", successMsg);
      return true;
    } else if (paymentStatus.status === "expire") {
      await Payment.findByIdAndUpdate(pendingPayment._id, {
        status: "expired",
      });

      const expireMsg =
        "⏰ *PEMBAYARAN EXPIRED*\n\n" +
        "Waktu pembayaran telah habis. Silakan buat pesanan baru dengan mengetik *menu* dan pilih donat yang diinginkan.";

      await sendWhatsAppText(sock, userId, expireMsg);
      await saveMessage(userId, "assistant", expireMsg);
      return true;
    } else if (
      statusValue === "cancel" ||
      statusValue === "deny" ||
      statusValue === "failed" ||
      statusValue === "expired" ||
      statusValue === "not_found"
    ) {
      await Payment.findByIdAndUpdate(pendingPayment._id, {
        status: "failed",
        transactionId:
          paymentStatus.transactionId || pendingPayment.transactionId,
        paymentType: paymentStatus.paymentType || pendingPayment.paymentType,
      });

      const cancelMsg =
        "❌ *PEMBAYARAN DIBATALKAN / GAGAL*\n\n" +
        "Pembayaran Anda tidak selesai karena status: " +
        `${statusValue}.` +
        "\n\nSilakan coba lagi dengan mengetik *menu* dan pilih donat yang diinginkan.";

      await sendWhatsAppText(sock, userId, cancelMsg);
      await saveMessage(userId, "assistant", cancelMsg);
      return true;
    } else if (paymentStatus.status === "pending") {
      // Masih pending, tidak perlu kirim pesan
      return false;
    }

    return false;
  } catch (error) {
    console.error("Error checking payment status:", error);

    // Jangan kirim error ke user jika masih pending check
    if (!error.message.includes("not found")) {
      const errorMsg =
        "⚠️ Maaf, terjadi kesalahan saat mengecek pembayaran. Silakan coba lagi nanti.";
      await sendWhatsAppText(sock, userId, errorMsg);
      await saveMessage(userId, "assistant", errorMsg);
    }
    return false;
  }
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

    const userId = msg.key.remoteJid;
    console.log(`📩 [${userId}]: ${text}`);

    try {
      // ==========================
      // 1. CEK STATUS PEMBAYARAN PENDING
      // ==========================
      const pendingPayment = await Payment.findOne({
        userId,
        status: "pending",
      });

      if (pendingPayment) {
        const handled = await checkPendingPayment(sock, userId, pendingPayment);
        if (handled) return;
      }

      // ==========================
      // 2. CEK PEMBAYARAN SUDAH SUKSES
      // ==========================
      const successPayment = await Payment.findOne({
        userId,
        status: "success",
      });

      if (successPayment) {
        const thankYouMsg =
          "✅ Terima kasih! Pembayaran Anda sudah kami terima. Pesanan sedang diproses.\n\n" +
          `*Order ID:* ${successPayment.orderId}`;
        await sendWhatsAppText(sock, userId, thankYouMsg);
        await Payment.findByIdAndDelete(successPayment._id);
        return;
      }

      // ==========================
      // 3. SIMPAN USER MESSAGE
      // ==========================
      await saveMessage(userId, "user", text);

      // ==========================
      // 4. AMBIL DATA
      // ==========================
      const products = await productService.getAllProducts();
      const cart = await getCart(userId);
      const chats = await Chat.findOne({ userId });
      const chatHistory = chats ? chats.messages : [];

      // ==========================
      // 5. HANDLE PERINTAH
      // ==========================

      // COMMAND: KERANJANG / CART
      if (
        text
          .toLowerCase()
          .match(/^(keranjang|cart|lihat keranjang|cek keranjang)$/)
      ) {
        const cartMsg = formatCartMessage(cart);
        await sendWhatsAppText(sock, userId, cartMsg);
        await saveMessage(userId, "assistant", cartMsg);
        return;
      }

      // COMMAND: BAYAR / CHECKOUT
      if (
        text
          .toLowerCase()
          .match(/^(bayar|checkout|selesai|proses bayar|langsung bayar)$/)
      ) {
        await handlePayment(sock, userId, cart);
        return;
      }

      // COMMAND: HAPUS ITEM
      const removeMatch = text
        .toLowerCase()
        .match(/^(hapus|remove|delete)\s+(.+)/);
      if (removeMatch) {
        const itemName = removeMatch[2].trim();
        const product = products.find((p) =>
          p.nama.toLowerCase().includes(itemName.toLowerCase()),
        );

        if (product) {
          const updatedCart = await removeFromCart(userId, product._id);
          const reply = `✅ *${product.nama}* telah dihapus dari keranjang.\n\n${formatCartMessage(updatedCart)}`;
          await sendWhatsAppText(sock, userId, reply);
          await saveMessage(userId, "assistant", reply);
        } else {
          const reply = `❌ Produk "${itemName}" tidak ditemukan.`;
          await sendWhatsAppText(sock, userId, reply);
          await saveMessage(userId, "assistant", reply);
        }
        return;
      }

      // COMMAND: TOTAL
      if (text.toLowerCase().includes("total")) {
        const totalMsg = formatCartMessage(cart);
        await sendWhatsAppText(sock, userId, totalMsg);
        await saveMessage(userId, "assistant", totalMsg);
        return;
      }

      // COMMAND: MENU
      if (text.toLowerCase().match(/^(menu|donat|varian|produk)$/)) {
        const menu = getMenuResponse();
        await sendWhatsAppImage(sock, userId, menu.imageUrl, menu.text);
        await saveMessage(userId, "assistant", menu.text);
        return;
      }

      // COMMAND: BATAL PESANAN
      if (text.toLowerCase().match(/^(batal|reset|clear cart|kosongkan)$/)) {
        await clearCart(userId);
        const reply = "🗑️ *Keranjang belanja telah dikosongkan*";
        await sendWhatsAppText(sock, userId, reply);
        await saveMessage(userId, "assistant", reply);
        return;
      }

      // ==========================
      // 6. PARSE ORDER (TAMBAH KE KERANJANG)
      // ==========================
      const order = parseOrderFromMessage(text, products);

      if (order && !order.error) {
        // Tambah ke cart
        const updatedCart = await addToCart(
          userId,
          order.product,
          order.quantity,
        );

        const subTotal = order.product.harga * order.quantity;
        const reply = `✅ *${order.quantity} ${order.product.nama}* ditambahkan ke keranjang! (Rp${subTotal.toLocaleString()})\n\n${formatCartMessage(updatedCart)}`;

        await sendWhatsAppText(sock, userId, reply);
        await saveMessage(userId, "assistant", reply);
        return;
      }

      if (order && order.error) {
        const reply = `❌ ${order.error}\n\nKetik *menu* untuk melihat daftar donat yang tersedia.`;
        await sendWhatsAppText(sock, userId, reply);
        await saveMessage(userId, "assistant", reply);
        return;
      }

      // ==========================
      // 7. AI RESPONSE (UNTUK PERTANYAAN LAIN)
      // ==========================
      const requestingMenu = await isRequestingMenu(
        text,
        products,
        chatHistory,
      );

      if (requestingMenu) {
        const menu = getMenuResponse();
        await sendWhatsAppImage(sock, userId, menu.imageUrl, menu.text);
        await saveMessage(userId, "assistant", menu.text);
      } else {
        const prompt = await buildPrompt(text, products, chatHistory);
        const aiReply = await generateAIResponse(prompt);

        await saveMessage(userId, "assistant", aiReply);
        await sendWhatsAppText(sock, userId, aiReply);
      }
    } catch (err) {
      console.error("❌ ERROR:", err);
      const errorMsg = "❌ Maaf, terjadi kesalahan. Silakan coba lagi nanti.";
      await sendWhatsAppText(sock, userId, errorMsg);
    }
  });
}

export default startBot;
