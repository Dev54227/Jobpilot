import { Profile } from '../models/Profile.js';

export async function getProfile(req, res) {
  // upsert so an older account without a profile still gets one
  const profile = await Profile.findOneAndUpdate(
    { user: req.userId },
    { $setOnInsert: { user: req.userId } },
    { new: true, upsert: true }
  );
  res.json({ profile });
}

// PUT replaces only the sections that are sent; omitted sections stay as they are.
export async function updateProfile(req, res) {
  const profile = await Profile.findOneAndUpdate(
    { user: req.userId },
    { $set: req.valid.body },
    { new: true, upsert: true, runValidators: true }
  );
  res.json({ profile });
}
