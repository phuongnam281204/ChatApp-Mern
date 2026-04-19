import User from "../models/user.model.js";

export const getMe = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: "User not found" });

  return res.json({
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
  });
};

export const searchUsers = async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ users: [] });

  const users = await User.find({
    $or: [
      { username: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
    ],
    _id: { $ne: req.user.id },
  })
    .limit(20)
    .select("username email avatarUrl");

  return res.json({
    users: users.map((u) => ({
      id: u._id,
      username: u.username,
      email: u.email,
      avatarUrl: u.avatarUrl,
    })),
  });
};
