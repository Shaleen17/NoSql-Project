const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema(
  {
    isGroupChat: {
      type: Boolean,
      default: false
    },
    chatName: {
      type: String,
      trim: true,
      default: ""
    },
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
      }
    ],
    directKey: {
      type: String,
      unique: true,
      sparse: true
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null
    },
    lastMessageText: {
      type: String,
      default: ""
    },
    lastMessageTime: {
      type: Date,
      default: null
    },
    unreadCount: {
      type: Map,
      of: Number,
      default: {}
    }
  },
  { timestamps: true }
);

chatSchema.index({ participants: 1 });
chatSchema.index({ updatedAt: -1 });
chatSchema.set("toJSON", { flattenMaps: true });

module.exports = mongoose.model("Chat", chatSchema);
