import mongoose from "mongoose";

const chatSchema = new mongoose.Schema({
  userId: String,
  message: String,
  isUser: Boolean,
  timestamp: { type: Date, default: Date.now },
});

export default mongoose.model("Chat", chatSchema);
