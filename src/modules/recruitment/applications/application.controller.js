const applicationService = require("./application.service");
const asyncHandler = require("../../../common/utils/asyncHandler");
const { ok, created } = require("../../../common/utils/response");

const apply = asyncHandler(async (req, res) => {
  const application = await applicationService.apply(req.params.jobId, req.user.id, req.body);
  created(res, application, "Application submitted");
});

const listForJob = asyncHandler(async (req, res) => {
  const { items, meta } = await applicationService.listForJob(req.params.jobId, req.user.id, req.query);
  res.status(200).json({ success: true, data: items, meta, message: "OK" });
});

const listMine = asyncHandler(async (req, res) => {
  const { items, meta } = await applicationService.listMine(req.user.id, req.query);
  res.status(200).json({ success: true, data: items, meta, message: "OK" });
});

const updateStatus = asyncHandler(async (req, res) => {
  const application = await applicationService.updateStatus(req.params.id, req.user.id, req.body.status);
  ok(res, application, "Application status updated");
});

module.exports = { apply, listForJob, listMine, updateStatus };
