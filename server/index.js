import dotenv from "dotenv";

import connectDB from "./config/db.js";
import startBot from "./bot/whatsapp.js";

dotenv.config();

async function start() {
  console.log("🚀 App starting...");

  await connectDB();
  console.log("✅ DB connected");

  await startBot(); // ✅ WAJIB pakai ()
  console.log("🤖 Bot started");
}

start();
