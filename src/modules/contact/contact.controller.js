const contactService = require("./contact.service");
const asyncHandler = require("../../common/utils/asyncHandler");
const { created, paginated } = require("../../common/utils/response");
const { inspect } = require("../../common/middleware/upload");
const { sendFile } = require("../../common/utils/fileResponse");

const create = asyncHandler(async (req, res) => {
  const file = req.file ? inspect(req.file, "image") : null;
  const contact = await contactService.submit(req.body, file);
  created(res, contact, "Thanks — we'll be in touch");
});

const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await contactService.list(req.query);
  paginated(res, items, pagination);
});

const downloadImage = asyncHandler(async (req, res) => {
  sendFile(res, await contactService.readImage(req.params.id));
});

module.exports = { create, list, downloadImage };
