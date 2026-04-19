import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["direct", "group"], required: true },
    name: { type: String, trim: true },
    avatarUrl: { type: String },
    members: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    lastMessageAt: { type: Date },
    lastMessagePreview: { type: String },
    lastReadAtByUser: { type: Map, of: Date, default: {} },
  },
  { timestamps: true },
);

conversationSchema.index({ members: 1, updatedAt: -1 });
conversationSchema.index({ type: 1, updatedAt: -1 });

const Conversation = mongoose.model("Conversation", conversationSchema);
export default Conversation;
