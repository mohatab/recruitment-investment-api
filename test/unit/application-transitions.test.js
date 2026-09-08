const applicationService = require("../../src/modules/recruitment/applications/application.service");

describe("application status transitions", () => {
  test("submitted can move to under_review or rejected only", () => {
    expect(applicationService.TRANSITIONS.submitted).toEqual(["under_review", "rejected"]);
  });

  test("accepted and rejected are terminal states", () => {
    expect(applicationService.TRANSITIONS.accepted).toEqual([]);
    expect(applicationService.TRANSITIONS.rejected).toEqual([]);
  });

  test("cannot skip from submitted straight to accepted", () => {
    expect(applicationService.TRANSITIONS.submitted).not.toContain("accepted");
  });
});
