const startupService = require("../../src/modules/investment/startups/startup.service");

describe("startup success-assessment heuristic", () => {
  test("flags well-funded software startups as likely to succeed", () => {
    const result = startupService.successAssessment({
      isSoftwareBased: true,
      hasAdCampaigns: false,
      hasConsulting: false,
      totalFunding: 600000,
    });
    expect(result.prediction).toBe("likely_to_succeed");
    expect(result.method).toBe("rule_based_heuristic");
  });

  test("flags low-funding non-software startups as unlikely", () => {
    const result = startupService.successAssessment({
      isSoftwareBased: false,
      hasAdCampaigns: false,
      hasConsulting: true,
      totalFunding: 1000,
    });
    expect(result.prediction).toBe("unlikely_to_succeed");
  });
});
