import mongoose from "mongoose";

const chatSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  messages: [
    {
      role: {
        type: String,
        required: true,
      },
      content: {
        type: String,
        required: true,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// 👇 TARUH DI SINI
chatSchema.index({ "messages.createdAt": 1 }, { expireAfterSeconds: 86400 });

// 👇 BARU export
export default mongoose.model("Chat", chatSchema);
