import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, select: false },
    googleId: { type: String, unique: true, sparse: true },
    avatarUrl: { type: String },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
    // Bumped on password change/reset; tokens carrying an older value stop
    // working, which signs out every other device. Missing = 0.
    tokenVersion: { type: Number, default: 0, select: false },
  },
  { timestamps: true },
);

userSchema.index({ username: 1 });

const User = mongoose.model("User", userSchema);
export default User;
