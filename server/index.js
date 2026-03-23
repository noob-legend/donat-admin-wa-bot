import dotenv from "dotenv";
import express from "express";

import connectDB from "./config/db.js";
import startBot from "./bot/whatsapp.js";
import Payment from "./models/Payment.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Webhook for Midtrans
app.post("/webhook/midtrans", async (req, res) => {
  const { order_id, transaction_status } = req.body;

  if (transaction_status === "settlement") {
    await Payment.findOneAndUpdate(
      { orderId: order_id },
      { status: "success" },
    );
  }

  res.sendStatus(200);
});

async function start() {
  console.log("🚀 App starting...");

  await connectDB();
  console.log("✅ DB connected");

  app.listen(PORT, () => {
    console.log(`🌐 Server running on port ${PORT}`);
  });

  await startBot(); // ✅ WAJIB pakai ()
  console.log("🤖 Bot started");
}

start();
