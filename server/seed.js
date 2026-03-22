import dotenv from "dotenv";
dotenv.config();
import connectDB from "./config/db.js";

import Product from "./models/Products.js";
import Training from "./models/DataTraining.js";

async function seed() {
  try {
    await connectDB();
    console.log("MongoDB connected");

    // ❗ Hapus data lama
    //await Product.deleteMany({});
    //await Chats.deleteMany({});

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
    const data = [
      // ========================
      // INTENT: SAPAAN
      // ========================
      {
        intent: "greeting",
        input: "halo",
        output: "Halo kak! Selamat datang di toko donat kami 😊",
        keywords: ["halo", "hai", "hi"],
      },
      {
        intent: "greeting",
        input: "hai",
        output: "Hai kak! Mau pesan donat atau lihat menu dulu? 😄",
        keywords: ["hai", "halo"],
      },

      // ========================
      // INTENT: TANYA HARGA
      // ========================
      {
        intent: "tanya_harga",
        input: "harga donat berapa",
        output: "Harga donat kami mulai dari 8 ribu per pcs ya kak 😊",
        keywords: ["harga", "berapa", "donat"],
      },
      {
        intent: "tanya_harga",
        input: "berapa harga",
        output: "Donat mulai dari 8k per pcs ya kak 😄",
        keywords: ["harga", "berapa"],
      },

      // ========================
      // INTENT: MENU
      // ========================
      {
        intent: "menu",
        input: "ada menu apa saja",
        output:
          "Kami punya berbagai varian donat, mau lihat menu lengkapnya kak?",
        keywords: ["menu", "varian", "donat"],
      },
      {
        intent: "menu",
        input: "lihat menu",
        output: "Ini menu donat kami ya kak 🍩",
        keywords: ["menu"],
      },

      // ========================
      // INTENT: PEMESANAN
      // ========================
      {
        intent: "order",
        input: "saya mau pesan",
        output: "Siap kak! Mau pesan varian apa dan berapa pcs? 😊",
        keywords: ["pesan", "order", "beli"],
        context: "pemesanan",
      },
      {
        intent: "order",
        input: "beli donat",
        output: "Mau beli berapa pcs kak? Dan varian apa? 😄",
        keywords: ["beli", "donat"],
      },

      // ========================
      // INTENT: TERIMA KASIH
      // ========================
      {
        intent: "thanks",
        input: "terima kasih",
        output: "Sama-sama kak 😊 ditunggu orderannya ya!",
        keywords: ["terima kasih", "makasih"],
      },
    ];

    await Training.insertMany(data);

    // 🚀 INSERT DATA
    // await Product.insertMany(products);

    console.log("✅ Seed data berhasil dimasukkan!");
    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

seed();
