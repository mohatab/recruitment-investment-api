const Contact = require("./contact.model");
const asyncHandler = require("../../common/utils/asyncHandler");
const { created } = require("../../common/utils/response");
const storage = require("../../common/storage");
const { safeKey } = require("../../common/middleware/upload");

const create = asyncHandler(async (req, res) => {
  let profileImageUrl = null;
  if (req.file) {
    const key = safeKey("contact-images", req.file.originalname);
    await storage.save(key, req.file.buffer, req.file.mimetype);
    profileImageUrl = storage.getUrl(key);
  }
  const contact = await Contact.create({ ...req.body, profileImageUrl });
  created(res, contact, "Thanks — we'll be in touch");
});

module.exports = { create };
