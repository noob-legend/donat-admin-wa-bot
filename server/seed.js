import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import connectDB from "./config/db.js";

import Product from "./models/Products.js";
import Chats from "./models/Chats.js";

async function seed() {
  try {
    await connectDB();
    console.log("MongoDB connected");

    // ❗ Hapus data lama
    await Product.deleteMany({});
    await Chats.deleteMany({});

    // 🍩 DATA PRODUK
    const products = [
      {
        nama: "Donat Cokelat Klasik",
        harga: 8000,
        stok: 50,
        kategori: "manis",
      },
      { nama: "Donat Strawberry", harga: 8500, stok: 40, kategori: "manis" },
      { nama: "Donat Tiramisu", harga: 12000, stok: 25, kategori: "premium" },
      { nama: "Donat Keju Susu", harga: 9000, stok: 35, kategori: "manis" },
      { nama: "Donat Matcha", harga: 13000, stok: 20, kategori: "premium" },
      { nama: "Donat Gula Halus", harga: 7000, stok: 60, kategori: "klasik" },
      { nama: "Donat Oreo", harga: 14000, stok: 20, kategori: "premium" },
    ];

    // 💬 DATA CHAT TRAINING
    const chats = [
      {
        intent: "tanya_produk",
        user: "ada donat coklat?",
        admin:
          "Ada kak 😊 Donat cokelat lagi ready, mau yang topping atau isi?",
      },
      {
        intent: "tanya_harga",
        user: "berapa harga donat?",
        admin: "Mulai dari 7 ribuan aja kak 😊",
      },
      {
        intent: "stok",
        user: "masih ready?",
        admin: "Masih ready kak 😊 Mau pesan berapa?",
      },
      {
        intent: "beli",
        user: "saya mau pesan",
        admin: "Siap kak 😊 Mau varian apa dan berapa pcs?",
      },
      {
        intent: "rekomendasi",
        user: "yang enak apa?",
        admin: "Best seller kita cokelat dan oreo kak 😍",
      },
      {
        intent: "promo",
        user: "ada promo?",
        admin: "Ada kak 😊 Paket hemat lebih murah loh 👍",
      },
      {
        intent: "jam",
        user: "buka jam berapa?",
        admin: "Kita buka jam 08.00 - 20.00 kak 😊",
      },
      {
        intent: "closing",
        user: "makasih",
        admin: "Sama-sama kak 😊 Ditunggu ordernya ya 🙏",
      },
      {
        intent: "random",
        user: "kamu siapa?",
        admin: "Aku admin toko donat kak 😊",
      },
      {
        intent: "fallback",
        user: "asdfgh",
        admin: "Maaf kak 🙏 Bisa tanya seputar donat ya 😊",
      },
    ];

    // 🚀 INSERT DATA
    await Product.insertMany(products);

    console.log("✅ Seed data berhasil dimasukkan!");
    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

seed();
