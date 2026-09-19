const Contact = require("./contact.model");
const storage = require("../../common/storage");
const { NotFoundError } = require("../../common/errors/AppError");
const { parsePagination, buildPagination } = require("../../common/utils/pagination");

const SORTABLE = ["createdAt"];

async function submit(data, file) {
  if (!file) return Contact.create({ ...data, image: null });

  await storage.save(file.key, file.buffer, file.contentType);
  try {
    return await Contact.create({
      ...data,
      image: { key: file.key, filename: file.filename, contentType: file.contentType, sizeBytes: file.sizeBytes },
    });
  } catch (err) {
    // Nothing references the file if the row never existed.
    await storage.remove(file.key);
    throw err;
  }
}

async function list(query) {
  const { page, limit, skip, sort } = parsePagination(query, { allowedSort: SORTABLE });
  const [items, total] = await Promise.all([
    Contact.find().sort(sort).skip(skip).limit(limit),
    Contact.countDocuments(),
  ]);
  return { items, pagination: buildPagination({ page, limit, total }) };
}

// Admin only (enforced by the route).
async function readImage(contactId) {
  const contact = await Contact.findById(contactId);
  if (!contact?.image) throw new NotFoundError("This submission has no image");
  const { key, ...metadata } = contact.image.toObject();
  return { ...metadata, buffer: await storage.read(key) };
}

module.exports = { submit, list, readImage, SORTABLE };
