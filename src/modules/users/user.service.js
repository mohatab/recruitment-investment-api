const User = require("./user.model");
const Job = require("../recruitment/jobs/job.model");
const Application = require("../recruitment/applications/application.model");
const storage = require("../../common/storage");
const ROLES = require("../../common/constants/roles");
const { ForbiddenError } = require("../../common/errors/AppError");
const authService = require("../auth/auth.service");
const { NotFoundError, UnprocessableEntityError, CODES } = require("../../common/errors/AppError");
const { parsePagination, buildPagination } = require("../../common/utils/pagination");

const SORTABLE = ["createdAt", "lastName", "role"];

async function getById(id) {
  const user = await User.findById(id);
  if (!user) throw new NotFoundError("User not found");
  return user;
}

// What one user is allowed to see of another: a name and a role, not their
// phone/birthdate/nationality/location — that's private profile data, only
// the owner (getMe) or an admin (list) should see it in full.
const PUBLIC_PROFILE_FIELDS = "firstName lastName role createdAt";
async function getPublicProfile(id) {
  const user = await User.findById(id).select(PUBLIC_PROFILE_FIELDS);
  if (!user) throw new NotFoundError("User not found");
  return user;
}

async function updateProfile(userId, updates) {
  const user = await getById(userId);
  Object.assign(user, updates);
  await user.save();
  return user;
}

// Admin only (enforced by the route). Deactivation takes effect immediately:
// every session is revoked and open sockets are disconnected.
async function setStatus(targetId, adminId, isActive) {
  if (String(targetId) === String(adminId)) {
    throw new UnprocessableEntityError(
      "You cannot change the status of your own account",
      CODES.SELF_STATUS_CHANGE_NOT_ALLOWED
    );
  }
  const user = await User.findByIdAndUpdate(targetId, { isActive }, { new: true });
  if (!user) throw new NotFoundError("User not found");
  if (!isActive) await authService.revokeAllSessions(user._id, "deactivated");
  return user;
}

async function list(query) {
  const { page, limit, skip, sort } = parsePagination(query, { allowedSort: SORTABLE });
  const filter = {};
  if (query.role) filter.role = query.role;

  const [items, total] = await Promise.all([
    User.find(filter).sort(sort).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  return { items, pagination: buildPagination({ page, limit, total }) };
}

// Replaces the stored CV, deleting the previous file. The database write
// happens first: if it fails the old file is still referenced and nothing is
// lost, and if the (best-effort) delete fails the worst case is an orphaned
// file, not an unreachable CV.
async function replaceCv(userId, { key, filename, contentType, sizeBytes, buffer }) {
  const user = await getById(userId);
  const previousKey = user.cv?.key;

  await storage.save(key, buffer, contentType);
  user.cv = { key, filename, contentType, sizeBytes, uploadedAt: new Date() };
  try {
    await user.save();
  } catch (err) {
    await storage.remove(key); // no metadata means the file is unreachable: drop it
    throw err;
  }

  if (previousKey && previousKey !== key) await storage.remove(previousKey);
  return user;
}

async function deleteCv(userId) {
  const user = await getById(userId);
  if (!user.cv) return false;

  const { key } = user.cv;
  user.cv = null;
  await user.save();
  await storage.remove(key);
  return true;
}

// Who may download a CV:
//   - its owner
//   - an admin
//   - a recruiter who received an application from that user to one of their
//     own jobs (exactly the existing "recruiter reviews their applicants" rule
//     from Task 4 — no wider)
async function assertCanReadCv(targetUserId, requester) {
  if (String(targetUserId) === String(requester.id)) return;
  if (requester.role === ROLES.ADMIN) return;

  if (requester.role === ROLES.RECRUITER) {
    const jobIds = await Job.distinct("_id", { recruiter: requester.id });
    if (jobIds.length && (await Application.exists({ applicant: targetUserId, job: { $in: jobIds } }))) return;
  }
  throw new ForbiddenError("You do not have permission to view this CV");
}

// Returns the file itself plus the metadata needed to serve it safely.
async function readCv(targetUserId, requester) {
  const user = await getById(targetUserId);
  await assertCanReadCv(user._id, requester);
  if (!user.cv) throw new NotFoundError("This user has not uploaded a CV");

  // toObject(): spreading the subdocument itself would copy Mongoose internals
  // (including a reference to the parent user) instead of the fields.
  const { key, ...metadata } = user.cv.toObject();
  return { ...metadata, buffer: await storage.read(key) };
}

module.exports = {
  getById,
  getPublicProfile,
  updateProfile,
  setStatus,
  list,
  replaceCv,
  deleteCv,
  readCv,
  assertCanReadCv,
  SORTABLE,
};
