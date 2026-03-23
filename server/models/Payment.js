import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  userId: String,
  orderId: String,
  amount: Number,
  status: { type: String, default: "pending" }, // pending, success, failed
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Payment", paymentSchema);
