import mongoose from "mongoose";

const trainingSchema = new mongoose.Schema({
  intent: {
    type: String,
    required: true,
    index: true,
  },
  input: {
    type: String,
    required: true,
  },
  output: {
    type: String,
    required: true,
  },
  keywords: [
    {
      type: String,
    },
  ],
  context: {
    type: String, // contoh: "pemesanan", "promo"
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Training", trainingSchema);
